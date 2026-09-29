import { SceneManager } from '../globe/index.ts';
import type { AppConfig, QualityLevel } from '../config/index.ts';
import { mountLocation, type ModelPointerMapper } from './mountLocation.ts';
import { raiseAppError, resolveAppErrors } from './errorState.ts';
import type { AppStore } from './AppStore.ts';
import { monotonicNow } from '../shared/index.ts';
import { qualityControl, globeControls, controlSource } from '../ui/index.ts';
import {
  CommandBus,
  createMouseInput,
  createStepInput,
  bindKeyboardInput,
  createInputAdapter,
  createAgentPort,
  type InteractionEvent,
} from '../interaction/index.ts';

export function mountScene(
  root: HTMLElement,
  config: Readonly<AppConfig>,
  store?: AppStore,
  onQualityChange: (value: QualityLevel) => void = () => {},
  onRendered: (atMs: number) => void = () => {},
  onInteractionEvent: (event: Readonly<InteractionEvent>) => void = () => {},
) {
  const host = root.ownerDocument.createElement('section');
  host.className = 'globe-surface';
  host.setAttribute('aria-label', '地球视图');
  root.append(host);
  const status = root.ownerDocument.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = '正在加载地球纹理…';
  const stage = root.querySelector('.stage');
  if (stage) stage.textContent = '拖动旋转，滚轮缩放；启用摄像头后可使用手势。';
  host.append(status);
  let scene: SceneManager | undefined;
  let bus: CommandBus | undefined;
  let location: ReturnType<typeof mountLocation> | undefined;
  let pointerMapper: ModelPointerMapper = () => undefined;
  let unbindKeyboard = () => {};
  let sendUi: ReturnType<typeof createStepInput> | undefined;
  let settingsInput: ReturnType<typeof createInputAdapter> | undefined;
  let textureStatus = '正在加载地球纹理…';
  let contextStatus = 'ready';
  const showStatus = () => {
    status.textContent =
      contextStatus === 'lost'
        ? '图形上下文丢失，正在等待浏览器恢复。摄像头保持关闭。'
        : contextStatus === 'failed'
          ? '图形暂时无法恢复，请重新加载页面。摄像头保持关闭。'
          : textureStatus;
  };
  function updateEarth(state: 'loading' | 'ready' | 'failed') {
    host.dataset.earthState = state;
    textureStatus =
      state === 'ready'
        ? '拖动旋转 · 滚轮缩放'
        : state === 'loading'
          ? '正在加载地球纹理…'
          : '地球纹理加载失败，当前显示备用材质。';
    if (state === 'failed') raiseAppError(store, 'E-GLB-001', 'M02', 'WARNING');
    else if (state === 'ready' && store) resolveAppErrors(store, 'E-GLB-001');
    showStatus();
  }
  const quality = qualityControl(
    root.ownerDocument,
    config.app.defaultQuality,
    (value) => {
      if (
        value !== 'LOW' &&
        value !== 'MEDIUM' &&
        value !== 'HIGH' &&
        value !== 'AUTO'
      )
        return;
      if (scene?.setQuality(value)) {
        quality.update(value, scene.getQualityState().effective);
        store?.dispatch({
          type: 'QUALITY_CHANGED',
          atMs: monotonicNow(),
          value,
        });
        onQualityChange(value);
      }
    },
  );
  host.append(quality.element);
  const controls = globeControls(root.ownerDocument, (action) => {
    sendUi?.(action);
  });
  host.append(controls.element);
  const sourceIndicator = controlSource(root.ownerDocument);
  host.append(sourceIndicator.element);
  const failed = () => {
    store?.dispatch({
      type: 'APP_BOOTSTRAPPED',
      atMs: monotonicNow(),
      available: false,
    });
    raiseAppError(store, 'E-GLB-002', 'M02', 'FATAL', 'NONE');
    host.dataset.renderState = 'failed';
    status.textContent =
      '无法启动三维场景。请检查浏览器图形加速设置后重新加载。摄像头仍保持关闭。';
  };
  try {
    scene = new SceneManager(host, config, failed, undefined, monotonicNow);
    scene.onFrameRendered(onRendered);
    scene.onContextState((state) => {
      contextStatus = state;
      if (state !== 'ready')
        raiseAppError(
          store,
          'E-GLB-002',
          'M02',
          state === 'failed' ? 'FATAL' : 'ERROR',
          'NONE',
        );
      else if (store) resolveAppErrors(store, 'E-GLB-002');
      showStatus();
    });
    const activeScene = scene;
    bus = new CommandBus(
      config,
      monotonicNow,
      () => activeScene.getViewState(),
      (command, source) =>
        activeScene.applyCommand(command, source === 'mouse'),
      {
        onSelection: (action) => location?.onSelection(action) ?? false,
        onRoute: (action) => location?.onRoute(action) ?? false,
        onEvent(event) {
          onInteractionEvent(event);
          if (event.type === 'SOURCE_CHANGED') {
            sourceIndicator.update(event.source);
            store?.dispatch({
              type: 'CONTROL_SOURCE_LOCKED',
              atMs: event.atMs,
              source: event.source ?? 'NONE',
              // Never re-enter bus.getState() from its synchronous event:
              // that advances its clock during an unfinished dispatch.
              lockUntilMs: event.source
                ? event.atMs +
                  (event.source === 'gesture'
                    ? config.gesture.lostHandMs
                    : config.interaction.mouseLockMs)
                : 0,
            });
          }
        },
      },
    );
    location = mountLocation(
      root,
      host,
      scene,
      config,
      bus,
      (point, rect) => pointerMapper(point, rect),
      store,
    );
    scene.onBeforeRender(() => {
      bus?.flush();
      const control = bus?.getState();
      if (control)
        store?.dispatch({
          type: 'CONTROL_SOURCE_LOCKED',
          atMs: monotonicNow(),
          source: control.owner ?? 'NONE',
          lockUntilMs: control.expiresAtMs ?? 0,
        });
      location?.update();
      store?.dispatch({
        type: 'GLOBE_VIEW_CHANGED',
        atMs: monotonicNow(),
        view: activeScene.getViewState(),
      });
    });
    scene.enableOrbitControls(createMouseInput(bus, monotonicNow, 'scene'));
    sendUi = createStepInput('ui', bus, monotonicNow, 'scene', config);
    settingsInput = createInputAdapter('ui', bus, monotonicNow, 'settings');
    unbindKeyboard = bindKeyboardInput(
      root.ownerDocument,
      createStepInput('keyboard', bus, monotonicNow, 'scene', config),
      () => location?.clearIfSelected() ?? false,
    );
    scene.start();
    store?.dispatch({
      type: 'APP_BOOTSTRAPPED',
      atMs: monotonicNow(),
      available: true,
    });
    void scene.loadEarth(updateEarth);
  } catch {
    failed();
  }
  return {
    setQuality(value: QualityLevel) {
      if (!scene?.setQuality(value)) return false;
      quality.update(value, scene.getQualityState().effective);
      store?.dispatch({ type: 'QUALITY_CHANGED', atMs: monotonicNow(), value });
      return true;
    },
    getQualityState: () => scene?.getQualityState(),
    setAutomaticQuality(value: 'LOW' | 'MEDIUM' | 'HIGH') {
      if (!scene?.setAutomaticQuality(value)) return false;
      const state = scene.getQualityState();
      quality.update(state.requested, state.effective);
      return true;
    },
    setReducedMotion: (enabled: boolean) => scene?.setReducedMotion(enabled),
    setAutoRotate: (enabled: boolean) =>
      settingsInput?.send('SET_AUTOROTATE', 'TRIGGER', { enabled }).accepted ??
      false,
    getInteraction: () => bus,
    getAgentPort: () =>
      config.features.agent && bus && scene
        ? createAgentPort(bus, () => scene!.getViewState())
        : undefined,
    retryTexture: () => scene?.loadEarth(updateEarth),
    retryCity: () => location?.retryCity(),
    stopForFatal() {
      bus?.cancelAll('FATAL');
      scene?.stop();
      scene?.disableOrbitControls();
    },
    setPointerMapper(mapper: ModelPointerMapper) {
      pointerMapper = mapper;
    },
    dispose() {
      quality.dispose();
      controls.dispose();
      unbindKeyboard();
      bus?.dispose();
      location?.dispose();
      scene?.dispose();
      host.remove();
    },
  };
}
