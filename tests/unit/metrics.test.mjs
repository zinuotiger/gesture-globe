import { test, expect } from 'vitest';
import { MetricWindow, MetricCollector } from '../../src/diagnostics/index.ts';
import { defaults } from '../../src/config/index.ts';
const metricOptions = {
  capacity: defaults.diagnostics.metricCapacity,
  windowMs: defaults.diagnostics.metricWindowMs,
};

test('nearest-rank P95, arithmetic median/mean, latest and unknown empty values', () => {
  const m = new MetricWindow(100, 1000);
  expect(m.snapshot(0)).toEqual({
    count: 0,
    latest: null,
    mean: null,
    median: null,
    p95: null,
    min: null,
    max: null,
  });
  for (let i = 1; i <= 100; i++) m.add(i, i);
  expect(m.snapshot(100)).toEqual({
    count: 100,
    latest: 100,
    mean: 50.5,
    median: 50.5,
    p95: 95,
    min: 1,
    max: 100,
  });
  const single = new MetricWindow(1, 100);
  single.add(0, 0);
  expect(single.snapshot(0).p95).toBe(0);
});
test('ring storage remains capped over long runs, expiration boundary is inclusive, invalid samples do not mutate', () => {
  const m = new MetricWindow(3, 100);
  for (let i = 0; i < 10000; i++) m.add(i, i);
  expect(m.snapshot(9999)).toMatchObject({ count: 3, min: 9997, max: 9999 });
  const before = m.snapshot(9999);
  for (const [value, at] of [
    [NaN, 9999],
    [Infinity, 9999],
    [-1, 9999],
    [1, NaN],
    [1, 9998],
  ])
    expect(m.add(value, at)).toBe(false);
  expect(m.snapshot(9999)).toEqual(before);
  expect(m.snapshot(10099).count).toBe(1);
  expect(m.snapshot(10100).count).toBe(0);
  m.clear();
  expect(m.snapshot(0).count).toBe(0);
});
test('actual event cadence and inference cost remain separate; pause excludes hidden gaps and disposal is inert', () => {
  const c = new MetricCollector(metricOptions);
  expect(c.snapshot(0).renderFps).toBeNull();
  for (let i = 0; i <= 60; i++) c.recordRender((i * 1000) / 60);
  for (let i = 0; i <= 20; i++) c.recordInference(i * 50, 10 + i);
  expect(c.snapshot(1000).renderFps).toBeCloseTo(60, 10);
  expect(c.snapshot(1000).inferenceFps).toBe(20);
  expect(c.snapshot(1000).inference).toMatchObject({
    count: 21,
    latest: 30,
    mean: 20,
    median: 20,
    p95: 29,
  });
  expect(c.recordInference(1000, 100)).toBe(false);
  expect(c.recordRender(NaN)).toBe(false);
  c.pauseRender();
  c.pauseInference();
  c.recordRender(10000);
  c.recordInference(10000, 5);
  expect(c.snapshot(10000).renderFps).toBeNull();
  expect(c.snapshot(10000).inferenceFps).toBeNull();
  c.dispose();
  expect(c.recordRender(10020)).toBe(false);
  expect(c.snapshot(10020).inference.count).toBe(0);
});
test('drop snapshot copies only scalar counters and rejects hostile/invalid data without calling accessors', () => {
  const c = new MetricCollector(metricOptions);
  const values = {
    submitted: 4,
    busy: 2,
    stale: 1,
    rate: 7,
    unavailable: 3,
    frame: 'not copied',
  };
  expect(c.updateDrops(values)).toBe(true);
  values.busy = 100;
  expect(c.snapshot(0).drops).toEqual({
    submitted: 4,
    busy: 2,
    stale: 1,
    rate: 7,
    unavailable: 3,
  });
  expect(c.updateDrops({ ...values, busy: -1 })).toBe(false);
  expect(
    c.updateDrops({
      ...values,
      get busy() {
        throw new Error('must not run');
      },
    }),
  ).toBe(false);
  expect(c.updateDrops(null)).toBe(false);
});
