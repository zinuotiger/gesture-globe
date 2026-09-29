import { test, expect } from 'vitest';
import { PerformanceGovernor } from '../../src/app/PerformanceGovernor.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';
import { QualityManager } from '../../src/globe/QualityManager.ts';
const good = {
  visible: true,
  inferenceActive: true,
  renderFps: 60,
  inferenceP95: 20,
  latencyP95: 60,
  alerts: [],
};
const bad = { ...good, renderFps: 20, alerts: ['LOW_RENDER'] };
test('only sustained health signals downgrade, steps are bounded and separated by cooldown', () => {
  const p = new PerformanceGovernor(defaults);
  expect(p.observe({ ...bad, alerts: [], atMs: 0 }).pressure).toBe(0);
  expect(p.observe({ ...bad, atMs: 3000 })).toEqual({
    pressure: 1,
    autoQuality: 'MEDIUM',
    targetHz: 20,
  });
  expect(p.observe({ ...bad, atMs: 7999 }).pressure).toBe(1);
  expect(p.observe({ ...bad, atMs: 8000 })).toEqual({
    pressure: 2,
    autoQuality: 'LOW',
    targetHz: 15,
  });
  expect(p.observe({ ...bad, atMs: 13000 }).pressure).toBe(2);
});
test('continuous healthy evidence restores one tier per hold; unknown/hidden/gap breaks recovery', () => {
  const p = new PerformanceGovernor(defaults);
  p.observe({ ...bad, atMs: 0 });
  p.observe({ ...bad, atMs: 5000 });
  for (let t = 5250; t < 20250; t += 250)
    expect(p.observe({ ...good, atMs: t }).pressure).toBe(2);
  expect(p.observe({ ...good, atMs: 20250 }).pressure).toBe(1);
  p.observe({ ...good, renderFps: null, atMs: 20500 });
  p.observe({ ...good, atMs: 20750 });
  p.observe({ ...good, visible: false, atMs: 21000 });
  p.observe({ ...good, atMs: 100000 });
  expect(p.snapshot().pressure).toBe(1);
  for (let t = 100250; t <= 115000; t += 250) p.observe({ ...good, atMs: t });
  expect(p.snapshot()).toEqual({
    pressure: 0,
    autoQuality: 'HIGH',
    targetHz: 24,
  });
});
test('inference/latency pressure requires active observed inference and restart/drop alerts alone do not adapt', () => {
  for (const [key, alert] of [
    ['inferenceP95', 'HIGH_INFERENCE'],
    ['latencyP95', 'HIGH_LATENCY'],
  ]) {
    const p = new PerformanceGovernor(defaults);
    expect(
      p.observe({
        ...good,
        [key]: 500,
        alerts: [alert],
        inferenceActive: false,
        atMs: 0,
      }).pressure,
    ).toBe(0);
    expect(
      p.observe({ ...good, [key]: 500, alerts: [alert], atMs: 250 }).pressure,
    ).toBe(1);
  }
  const p = new PerformanceGovernor(defaults);
  expect(
    p.observe({ ...good, alerts: ['HIGH_DROPS', 'WORKER_RESTART'], atMs: 0 })
      .pressure,
  ).toBe(0);
  expect(p.observe({ ...bad, atMs: NaN }).pressure).toBe(0);
  p.observe({ ...good, atMs: 100 });
  expect(p.observe({ ...bad, atMs: 99 }).pressure).toBe(0);
});
test('manual quality is preserved while AUTO tier changes; configured starting ceiling and inference limits stay bounded', () => {
  const q = new QualityManager(defaults);
  q.set('HIGH');
  q.setAutomatic('LOW');
  expect(q.getState()).toMatchObject({ requested: 'HIGH', effective: 'HIGH' });
  q.set('AUTO');
  expect(q.getState()).toMatchObject({
    requested: 'AUTO',
    effective: 'LOW',
    atmosphere: false,
    pixelRatioCap: 1,
  });
  expect(q.setAutomatic('AUTO')).toBe(false);
  const config = parseConfig({
    quality: { autoInitial: 'MEDIUM' },
    vision: { targetHz: 17, minHz: 16 },
  });
  const p = new PerformanceGovernor(config);
  expect(p.snapshot().autoQuality).toBe('MEDIUM');
  expect(p.observe({ ...bad, atMs: 0 })).toEqual({
    pressure: 1,
    autoQuality: 'LOW',
    targetHz: 17,
  });
  expect(p.observe({ ...bad, atMs: 5000 }).targetHz).toBe(16);
  expect(() =>
    parseConfig({
      diagnostics: {
        adaptive: { stepCooldownMs: 10000, recoveryHoldMs: 5000 },
      },
    }),
  ).toThrow(/adaptive/);
});
