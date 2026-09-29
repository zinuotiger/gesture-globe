import {
  numericRules,
  type AppConfig,
  type QualityLevel,
} from '../config/index.ts';
import { createSettingsPanel } from '../ui/index.ts';
import { monotonicNow } from '../shared/index.ts';
import type { AppStore } from './AppStore.ts';
import {
  defaultPreferences,
  parsePreferences,
  preferencesKey,
  readPreferences,
  writePreferences,
  type Preferences,
} from './Preferences.ts';

interface SettingsPorts {
  quality(value: QualityLevel): boolean;
  visibility(preview: boolean, skeleton: boolean): void;
  gesture(value: Readonly<Preferences>): void;
  reducedMotion(enabled: boolean): void;
  autoRotate(enabled: boolean): boolean;
  stopCamera(): void;
  resetOnboarding(): void;
}
export function mountSettings(
  root: HTMLElement,
  config: Readonly<AppConfig>,
  store: AppStore,
  ports: SettingsPorts,
) {
  const document = root.ownerDocument;
  const window = document.defaultView!;
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    /* Session preferences remain available. */
  }
  let storageAvailable = !!storage;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;
  const render = () =>
    panel.update(
      store.getState().preferences,
      store.getState(),
      media.matches,
      storageAvailable,
    );
  const apply = (value: Readonly<Preferences>, autoChanged: boolean) => {
    ports.quality(value.quality);
    ports.visibility(value.showPreview, value.showSkeleton);
    ports.gesture(value);
    const reduced = value.reducedMotion || media.matches;
    ports.reducedMotion(reduced);
    if (reduced || autoChanged) ports.autoRotate(value.autoRotate && !reduced);
    store.dispatch({
      type: 'PREFERENCES_CHANGED',
      atMs: monotonicNow(),
      value,
    });
    render();
  };
  const change = (patch: Partial<Preferences>) => {
    if (disposed || store.getState().appPhase === 'FATAL') return false;
    let value: Readonly<Preferences>;
    try {
      value = parsePreferences({ ...store.getState().preferences, ...patch });
    } catch {
      render();
      return false;
    }
    storageAvailable = writePreferences(storage, value);
    apply(value, Object.hasOwn(patch, 'autoRotate'));
    return true;
  };
  const reset = () => {
    ports.resetOnboarding();
    try {
      storage?.removeItem(preferencesKey);
    } catch {
      storageAvailable = false;
    }
    apply(defaultPreferences(config), true);
  };
  const panel = createSettingsPanel(
    document,
    numericRules['ui.gestureSensitivity']!,
    change,
    reset,
    ports.stopCamera,
  );
  (root.querySelector('header') ?? root).append(panel.element);
  const unsubscribe = store.subscribe(
    (state) =>
      JSON.stringify([
        state.preferences,
        state.qualityLevel,
        state.view.autoRotate,
      ]),
    render,
  );
  const systemChanged = () => {
    const reduced = media.matches || store.getState().preferences.reducedMotion;
    ports.reducedMotion(reduced);
    if (reduced) ports.autoRotate(false);
    // Removing the OS constraint never starts motion without another user action.
    render();
  };
  media.addEventListener('change', systemChanged);
  apply(readPreferences(storage, config), true);
  return {
    change,
    dispose() {
      if (disposed) return;
      disposed = true;
      media.removeEventListener('change', systemChanged);
      unsubscribe();
      panel.dispose();
    },
  };
}
