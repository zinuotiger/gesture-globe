import { test, expect } from 'vitest';
import { StabilityRecorder } from '../support/StabilityRecorder.ts';
const observation = {
  visible: true,
  heapBytes: null,
  renderFps: 60,
  inferenceP95: 50,
  latencyMax: null,
  inFlight: 1,
  busyDrops: 3,
  errors: 0,
};
test('virtual twenty minutes proves recorder bounds only and never signs actual acceptance', () => {
  const r = new StabilityRecorder();
  for (let t = 0; t <= 1300000; t += 1000) r.observe(t, observation);
  const report = r.snapshot();
  expect(report.samples).toHaveLength(1201);
  expect(report.elapsedMs).toBe(1200000);
  expect(report.collection).toBe('READY_FOR_REVIEW');
  expect(report.acceptance).toBe('NOT_REVIEWED');
  expect(report.heapDeltaBytes).toBeNull();
  expect(report.running).toBe(false);
  expect(r.active).toBe(false);
});
test('hidden/gapped or interrupted runs remain incomplete; invalid and unknown numbers cannot become a pass', () => {
  const r = new StabilityRecorder();
  r.observe(0, observation);
  r.observe(500, { ...observation, visible: false });
  expect(r.observe(NaN, observation)).toBe(false);
  r.observe(1200000, {
    ...observation,
    inFlight: 2,
    latencyMax: 1001,
    renderFps: Infinity,
  });
  const report = r.snapshot();
  expect(report.collection).toBe('INCOMPLETE');
  expect(report.hiddenObserved).toBe(true);
  expect(report.samplingGapObserved).toBe(true);
  expect(report.queueViolation).toBe(true);
  expect(report.latencyOverOneSecond).toBe(true);
  expect(report.samples[1].renderFps).toBeNull();
  const short = new StabilityRecorder();
  expect(short.active).toBe(true);
  short.observe(1, observation);
  short.stop();
  expect(short.active).toBe(false);
  expect(short.observe(1200001, observation)).toBe(false);
  expect(short.snapshot().collection).toBe('INCOMPLETE');
});
test('only scalar whitelist is copied and snapshots cannot mutate the collector', () => {
  const r = new StabilityRecorder();
  r.observe(0, {
    ...observation,
    heapBytes: 10,
    frames: ['private'],
    landmarks: ['private'],
  });
  const first = r.snapshot();
  expect(first.samples[0]).not.toHaveProperty('frames');
  expect(first.samples[0]).not.toHaveProperty('landmarks');
  first.samples[0].heapBytes = 0;
  r.observe(1000, { ...observation, heapBytes: 20 });
  expect(r.snapshot().heapDeltaBytes).toBe(10);
});
