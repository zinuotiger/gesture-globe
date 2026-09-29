import { test, expect } from 'vitest';
import {
  EventRingBuffer,
  HealthEvaluator,
} from '../../src/diagnostics/index.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';
const good = {
  renderFps: 60,
  inferenceP95: 20,
  latencyP95: 70,
  dropRatio: 0.01,
  restarts: 0,
};
test('fixed ring overwrites oldest and owns immutable whitelist copies', () => {
  const ring = new EventRingBuffer(200);
  const source = { type: 'SOURCE', module: 'M06', source: 'mouse', atMs: 0 };
  ring.record(source);
  source.source = 'agent';
  expect(ring.snapshot()[0].source).toBe('mouse');
  for (let i = 1; i <= 10000; i++) ring.record({ ...source, atMs: i });
  expect(ring.snapshot()).toHaveLength(200);
  expect(ring.snapshot()[0].atMs).toBe(9801);
  expect(ring.snapshot().at(-1).atMs).toBe(10000);
  expect(Object.isFrozen(ring.snapshot()[0])).toBe(true);
  ring.clear();
  expect(ring.snapshot()).toEqual([]);
});
test('private fields, paths, arbitrary text and accessors cannot enter diagnostics', () => {
  const ring = new EventRingBuffer(2);
  const base = {
    type: 'ERROR',
    module: 'M04',
    code: 'E-VIS-003',
    atMs: 1,
    sessionId: 'session-1',
    recoverable: true,
  };
  expect(ring.record(base)).toBe(true);
  for (const invalid of [
    { ...base, detail: 'C:/Users/name' },
    { ...base, deviceId: 'secret' },
    { ...base, landmarks: [] },
    { ...base, code: '/private/file' },
    { ...base, sessionId: 'user@example.com' },
    { ...base, module: 'private-module' },
    { ...base, atMs: NaN },
    Object.defineProperty({}, 'atMs', {
      get() {
        throw Error('do not read');
      },
    }),
  ])
    expect(ring.record(invalid)).toBe(false);
  expect(ring.snapshot()).toEqual([base]);
  expect(ring.getRejected()).toBe(8);
});
test('all sustained scalar alerts trigger at the deadline and recover only after healthy dwell', () => {
  const h = new HealthEvaluator(defaults.diagnostics.health);
  const bad = {
    ...good,
    renderFps: 20,
    inferenceP95: 200,
    latencyP95: 250,
    dropRatio: 0.6,
  };
  for (let t = 0; t < 3000; t += 250) expect(h.evaluate(bad, t)).toEqual([]);
  expect(h.evaluate(bad, 3000)).toEqual([
    'LOW_RENDER',
    'HIGH_INFERENCE',
    'HIGH_LATENCY',
    'HIGH_DROPS',
  ]);
  for (let t = 3250; t < 13250; t += 250)
    expect(h.evaluate(good, t)).toHaveLength(4);
  expect(h.evaluate(good, 13250)).toEqual([]);
});
test('hysteresis, unavailable samples and hidden-page gaps cannot fabricate activation or recovery', () => {
  const h = new HealthEvaluator(defaults.diagnostics.health);
  const bad = { ...good, renderFps: 20 };
  h.evaluate(bad, 0);
  h.evaluate(bad, 10000);
  expect(h.snapshot()).toEqual([]);
  for (let t = 10250; t <= 13000; t += 250) h.evaluate(bad, t);
  expect(h.snapshot()).toEqual(['LOW_RENDER']);
  for (let t = 13250; t <= 30000; t += 250)
    h.evaluate({ ...good, renderFps: 35 }, t);
  expect(h.snapshot()).toEqual(['LOW_RENDER']);
  for (let t = 30250; t <= 45000; t += 250)
    h.evaluate({ ...good, renderFps: null }, t);
  expect(h.snapshot()).toEqual(['LOW_RENDER']);
  expect(h.evaluate(good, NaN)).toEqual(['LOW_RENDER']);
  expect(h.evaluate(good, 1)).toEqual(['LOW_RENDER']);
  h.reset();
  expect(h.snapshot()).toEqual([]);
});
test('worker restart raises once per increment, clears after observed recovery and accepts a reset budget', () => {
  const h = new HealthEvaluator(defaults.diagnostics.health);
  h.evaluate(good, 0);
  expect(h.evaluate({ ...good, restarts: 1 }, 250)).toEqual(['WORKER_RESTART']);
  for (let t = 500; t <= 10250; t += 250)
    h.evaluate({ ...good, restarts: 1 }, t);
  expect(h.snapshot()).toEqual([]);
  h.evaluate(good, 10500);
  expect(h.evaluate({ ...good, restarts: 1 }, 10750)).toEqual([
    'WORKER_RESTART',
  ]);
});
test('health thresholds are validated configuration, versioned and cannot invert recovery bounds', () => {
  expect(defaults.configVersion).toBe('2026.09.3');
  for (const health of [
    { lowFps: 55, recoveredFps: 50 },
    { highInferenceMs: 50, recoveredInferenceMs: 60 },
    { highLatencyMs: 100, recoveredLatencyMs: 120 },
    { highDropRatio: 0.1, recoveredDropRatio: 0.2 },
    { recoverMs: 2000, triggerMs: 3000 },
  ])
    expect(() => parseConfig({ diagnostics: { health } })).toThrow(/health/);
});
