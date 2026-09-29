import type { SceneManager } from '../globe/index.ts';
import type { AppConfig } from '../config/index.ts';
import { monotonicNow, normalizeLongitude } from '../shared/index.ts';
import {
  createInputAdapter,
  type InputPort,
  type InteractionHooks,
} from '../interaction/index.ts';
import {
  DwellSelector,
  resolveEarthRaycaster,
  GeoConverter,
  MarkerManager,
  RouteOverlay,
  LocationSelection,
  loadCityIndex,
  mapScreenPoint,
  type ScreenPoint,
} from '../geo/index.ts';
import { createLocationCard, createPointingFeedback } from '../ui/index.ts';
import { raiseAppError, resolveAppErrors } from './errorState.ts';
import type { AppStore } from './AppStore.ts';

export type ModelPointerMapper = (
  point: ScreenPoint,
  canvas: DOMRect,
) => ScreenPoint | undefined;

export function mountLocation(
  root: HTMLElement,
  host: HTMLElement,
  scene: SceneManager,
  config: Readonly<AppConfig>,
  port: InputPort,
  mapPointer: ModelPointerMapper,
  store?: AppStore,
) {
  const document = root.ownerDocument;
  const dwell = new DwellSelector(config);
  const feedback = createPointingFeedback(document, config.point.radiusNorm);
  host.append(feedback.element);
  let pointer: ScreenPoint | null = null;
  let pointerAt = -Infinity;
  let hitEarth = false;
  function cancelPointer() {
    dwell.cancel();
    pointer = null;
    hitEarth = false;
    renderPointer();
  }
  function renderPointer() {
    feedback.update({ ...dwell.getState(), pointer, hit: hitEarth });
  }

  const converter = new GeoConverter(config);
  const marker = new MarkerManager(scene.scene, config);
  const route = config.features.agent
    ? new RouteOverlay(scene.scene, config)
    : undefined;
  const input = createInputAdapter('ui', port, monotonicNow, 'location');
  const card = createLocationCard(document, {
    clear,
    focus() {
      const selection = location.getState().selection;
      if (selection)
        input.send('FOCUS', 'TRIGGER', {
          lat: selection.latitude,
          lon: selection.longitude,
        });
    },
    retry() {
      const selection = location.getState().selection;
      if (selection) void location.select(selection);
    },
  });
  const location = new LocationSelection(
    (signal) => loadCityIndex(config, signal),
    (state) => {
      if (state.cityStatus === 'ERROR')
        raiseAppError(store, 'E-GEO-001', 'M07', 'WARNING');
      else if (
        store &&
        ['EMPTY', 'MATCHED', 'UNMATCHED'].includes(state.cityStatus)
      )
        resolveAppErrors(store, 'E-GEO-001');
      if (state.selection) marker.setSelection(state.selection);
      else marker.clear();
      if (!store) card.update(state);
      store?.dispatch({
        type: 'SELECTION_COMMITTED',
        atMs: monotonicNow(),
        value: state.selection,
        cityStatus: state.cityStatus,
      });
    },
  );
  const unsubscribe = store?.subscribe(
    (state) => state.selection,
    (selection) =>
      card.update({
        selection: selection.value ?? null,
        cityStatus: selection.cityStatus as ReturnType<
          LocationSelection['getState']
        >['cityStatus'],
      }),
  );
  root.append(card.element);
  function clear() {
    cancelPointer();
    location.clear();
  }
  const onSelection: NonNullable<InteractionHooks['onSelection']> = (
    action,
  ) => {
    if (action.type === 'SELECT_CANCEL') {
      cancelPointer();
      return true;
    }
    if (action.type === 'SELECT_GEO') {
      if (document.hidden) return false;
      cancelPointer();
      void location.select({
        schemaVersion: 1,
        selectionId: `agent:${action.id}`,
        selectedAtMs: action.atMs,
        latitude: action.lat,
        longitude: normalizeLongitude(action.lon),
      });
      return true;
    }
    const canvas = host.querySelector('canvas');
    const raycaster = resolveEarthRaycaster(scene.camera, scene.scene);
    if (!canvas || !raycaster || document.hidden) {
      cancelPointer();
      return false;
    }
    const rect = canvas.getBoundingClientRect();
    const client = mapPointer(action.pointer, rect);
    const mapped = client && mapScreenPoint(client, rect);
    // UI occlusion is decided before raycasting; markers never join the pick list.
    const target = client && document.elementFromPoint(client.x, client.y);
    if (!mapped || target !== canvas) {
      cancelPointer();
      return true;
    }
    const hit = raycaster.hit(mapped.ndc);
    pointer = {
      x: mapped.local.x / rect.width,
      y: mapped.local.y / rect.height,
    };
    pointerAt = action.atMs;
    hitEarth = !!hit;
    const result = dwell.update(
      { x: mapped.local.x / rect.width, y: mapped.local.y / rect.height },
      hit?.point,
      action.atMs,
    );
    renderPointer();
    if (result.selection) {
      const geo = converter.worldToGeo(result.selection.point);
      if (geo)
        void location.select({
          schemaVersion: 1,
          selectionId: result.selection.selectionId,
          selectedAtMs: result.selection.selectedAtMs,
          latitude: geo.latitude,
          longitude: geo.longitude,
        });
    }
    return true;
  };
  return {
    onSelection,
    onRoute: (
      action: Parameters<NonNullable<InteractionHooks['onRoute']>>[0],
    ) => !document.hidden && (route?.setPoints(action.points) ?? false),
    async retryCity() {
      const selection = location.getState().selection;
      if (selection) await location.select(selection);
    },
    clearIfSelected() {
      if (!location.getState().selection) return false;
      clear();
      input.send('CANCEL', 'TRIGGER', {});
      return true;
    },
    update() {
      const now = monotonicNow();
      dwell.expire(now);
      if (now - pointerAt > config.vision.staleFrameMs) {
        pointer = null;
        hitEarth = false;
      }
      renderPointer();
      const state = store?.getState();
      const progress =
        state?.gesture.kind === 'SELECT' && state.gesture.status === 'ACTIVE'
          ? dwell.getState().progress
          : 0;
      if (state && state.selection.progress !== progress)
        store?.dispatch({
          type: 'SELECTION_PROGRESS_CHANGED',
          atMs: now,
          progress,
        });
      marker.update(scene.camera);
    },
    getState: () => location.getState(),
    getDwellState: () => dwell.getState(),
    dispose() {
      route?.dispose();
      dwell.cancel();
      feedback.dispose();
      location.dispose();
      unsubscribe?.();
      marker.dispose();
      card.dispose();
    },
  };
}
