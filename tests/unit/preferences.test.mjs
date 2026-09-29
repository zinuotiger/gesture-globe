import { test, expect } from 'vitest';
import {
  defaultPreferences,
  parsePreferences,
  preferencesKey,
  readPreferences,
  writePreferences,
  transformGesturePreference,
} from '../../src/app/Preferences.ts';
import { defaults } from '../../src/config/index.ts';
function storage(value) {
  const values = new Map([
    [preferencesKey, value],
    ['unrelated', 'keep'],
  ]);
  return {
    values,
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
}
test('only complete versioned finite whitelist preferences are accepted', () => {
  const good = defaultPreferences();
  expect(parsePreferences(good)).toEqual(good);
  for (const patch of [
    { storageVersion: 2 },
    { sensitivity: 0 },
    { sensitivity: Infinity },
    { sensitivity: NaN },
    { sensitivity: '1' },
    { quality: 'ULTRA' },
    { showSkeleton: 'false' },
    { frames: [] },
    { deviceId: 'private' },
    { modelUrl: 'injected' },
  ])
    expect(() => parsePreferences({ ...good, ...patch })).toThrow();
  expect(() => parsePreferences({ storageVersion: 1 })).toThrow();
  expect(() =>
    parsePreferences({
      ...good,
      get sensitivity() {
        throw new Error('accessor must not run');
      },
    }),
  ).toThrow('Invalid preferences');
});
test('corrupt/incompatible values clear only own key; storage faults never block session operation', () => {
  for (const raw of [
    'broken',
    JSON.stringify({ ...defaultPreferences(), storageVersion: 2 }),
    JSON.stringify({ frame: 'private' }),
  ]) {
    const s = storage(raw);
    expect(readPreferences(s, defaults)).toEqual(defaultPreferences());
    expect(s.values.has(preferencesKey)).toBe(false);
    expect(s.values.get('unrelated')).toBe('keep');
  }
  const denied = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  expect(readPreferences(denied, defaults)).toEqual(defaultPreferences());
  expect(writePreferences(denied, defaultPreferences())).toBe(false);
  const s = storage(null);
  expect(writePreferences(s, defaultPreferences())).toBe(true);
  expect(readPreferences(s, defaults)).toEqual(defaultPreferences());
});
test('gesture-only gain/inversion preserves intent identity, time and nonmovement edges', () => {
  const intent = {
    schemaVersion: 1,
    id: 'one',
    sessionId: 's',
    source: 'gesture',
    sourceHandId: 'h',
    kind: 'ROTATE',
    phase: 'UPDATE',
    timestampMs: 10,
    confidence: 0.9,
    delta: { x: 0.2, y: 0.1 },
  };
  const prefs = parsePreferences({
    ...defaultPreferences(),
    sensitivity: 2,
    invertX: true,
  });
  const result = transformGesturePreference(intent, prefs, defaults);
  expect(result).toEqual({ ...intent, delta: { x: -0.4, y: 0.2 } });
  expect(intent.delta.x).toBe(0.2);
  const reset = { ...intent, kind: 'RESET', delta: undefined };
  expect(transformGesturePreference(reset, prefs, defaults)).toBe(reset);
});
