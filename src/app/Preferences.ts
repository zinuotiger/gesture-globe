import {
  defaults,
  numericRules,
  type AppConfig,
  type QualityLevel,
} from '../config/index.ts';
import { isPlainDto, type GestureIntent } from '../shared/index.ts';
export const preferencesKey = 'gesture-globe.preferences.v1';
export interface Preferences {
  storageVersion: 1;
  quality: QualityLevel;
  showSkeleton: boolean;
  showPreview: boolean;
  autoRotate: boolean;
  reducedMotion: boolean;
  sensitivity: number;
  invertX: boolean;
  invertY: boolean;
}
export function defaultPreferences(
  config: Readonly<AppConfig> = defaults,
): Readonly<Preferences> {
  return Object.freeze({
    storageVersion: 1,
    quality: config.app.defaultQuality,
    showSkeleton: true,
    showPreview: true,
    autoRotate: config.app.autoRotateOnStart,
    reducedMotion: false,
    sensitivity: config.ui.gestureSensitivity,
    invertX: config.rotate.invertX,
    invertY: config.rotate.invertY,
  });
}
export function parsePreferences(value: unknown): Readonly<Preferences> {
  if (!isPlainDto(value) || !value || typeof value !== 'object')
    throw new TypeError('Invalid preferences');
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(defaultPreferences());
  const range = numericRules['ui.gestureSensitivity']!;
  if (
    Object.keys(raw).length !== keys.length ||
    Object.keys(raw).some((key) => !keys.includes(key)) ||
    raw.storageVersion !== 1 ||
    !['LOW', 'MEDIUM', 'HIGH', 'AUTO'].includes(String(raw.quality)) ||
    [
      'showSkeleton',
      'showPreview',
      'autoRotate',
      'reducedMotion',
      'invertX',
      'invertY',
    ].some((key) => typeof raw[key] !== 'boolean') ||
    typeof raw.sensitivity !== 'number' ||
    raw.sensitivity < range.min ||
    raw.sensitivity > range.max
  )
    throw new TypeError('Invalid preferences');
  return Object.freeze({ ...raw }) as unknown as Readonly<Preferences>;
}
export type PreferenceStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;
export function readPreferences(
  storage: PreferenceStorage | undefined,
  config: Readonly<AppConfig>,
) {
  try {
    const raw = storage?.getItem(preferencesKey);
    if (raw) return parsePreferences(JSON.parse(raw));
  } catch {
    try {
      storage?.removeItem(preferencesKey);
    } catch {
      /* Session-only settings remain usable. */
    }
  }
  return defaultPreferences(config);
}
export function writePreferences(
  storage: PreferenceStorage | undefined,
  value: Readonly<Preferences>,
): boolean {
  const validated = parsePreferences(value);
  try {
    if (!storage) return false;
    storage.setItem(preferencesKey, JSON.stringify(validated));
    return true;
  } catch {
    return false;
  }
}
export function transformGesturePreference(
  intent: GestureIntent,
  preferences: Readonly<Preferences>,
  config: Readonly<AppConfig>,
): GestureIntent {
  if (!intent.delta || !['ROTATE', 'ZOOM'].includes(intent.kind)) return intent;
  return {
    ...intent,
    delta: {
      x:
        intent.delta.x *
        preferences.sensitivity *
        (intent.kind === 'ROTATE' &&
        preferences.invertX !== config.rotate.invertX
          ? -1
          : 1),
      y:
        intent.delta.y *
        preferences.sensitivity *
        (intent.kind === 'ROTATE' &&
        preferences.invertY !== config.rotate.invertY
          ? -1
          : 1),
    },
  };
}
