import assert from 'node:assert/strict';
import { test } from 'vitest';
import { TemporalFilter, ema, applyDeadzone } from '../../src/gesture/index.ts';
import { extractFeatures } from '../../src/gesture/index.ts';
import { syntheticFrame } from '../fixtures/vision-sequences.mjs';
const base = extractFeatures(syntheticFrame().hands[0], 0);
function input(id, time, x = 0.4, patch = {}) {
  return {
    sessionId: 's',
    frameId: id,
    captureTimeMs: time,
    resultTimeMs: time + 1,
    handId: 'h1',
    features: {
      ...base,
      controlEligible: true,
      palm: { x, y: 0.4, z: 0 },
      pointer: { x: x + 0.1, y: 0.3, z: 0 },
      pinchRatio: 0.4,
    },
    ...patch,
  };
}
test('EMA and deadzone validate numbers, preserve signs and use stable weighted arithmetic', () => {
  assert.equal(ema(undefined, 2, 0.25), 2);
  assert.equal(ema(0, 4, 0.25), 1);
  assert.equal(ema(1, 4, 1), 4);
  assert.equal(ema(-1e308, 1e308, 0.5), 0);
  for (const alpha of [0, -1, 2, NaN, Infinity])
    assert.equal(ema(0, 1, alpha), undefined);
  assert.equal(ema(NaN, 1, 0.25), undefined);
  assert.equal(ema(0, Infinity, 0.25), undefined);
  for (const x of [-0.006, 0, 0.006]) assert.equal(applyDeadzone(x, 0.006), 0);
  assert.equal(applyDeadzone(-0.01, 0.006), -0.01);
  assert.equal(applyDeadzone(Infinity, 0.006), undefined);
  assert.equal(applyDeadzone(1, -1), undefined);
});
test('palm/ratio EMA and faster pointer smoothing reduce deterministic stationary jitter', () => {
  const filter = new TemporalFilter();
  const first = filter.update(input(0, 0));
  assert.equal(first.canMove, false);
  assert.deepEqual(first.delta, { x: 0, y: 0 });
  let rawEnergy = 0,
    filteredEnergy = 0;
  for (let i = 1; i <= 200; i++) {
    const x = 0.4 + (i % 2 ? 0.01 : -0.01),
      sample = input(i, i * 40, x);
    sample.features.pinchRatio = 0.4 + (i % 2 ? 0.02 : -0.02);
    const result = filter.update(sample);
    rawEnergy += (x - 0.4) ** 2;
    filteredEnergy += (result.palm.x - 0.4) ** 2;
    assert.equal(result.canMove, true);
    assert.equal(result.dtSeconds, 0.04);
    if (i === 1) {
      assert.ok(Math.abs(result.palm.x - 0.4025) < 1e-12);
      assert.ok(Math.abs(result.pointer.x - 0.5035) < 1e-12);
      assert.ok(Math.abs(result.pinchRatio - 0.405) < 1e-12);
    }
  }
  assert.ok(filteredEnergy < rawEnergy / 10);
});
test('large gap, outlier and hand change rebuild anchors with zero first-frame delta', () => {
  const filter = new TemporalFilter();
  filter.update(input(0, 0));
  const moving = filter.update(input(1, 40, 0.42));
  assert.ok(moving.delta.x > 0);
  const gap = filter.update(input(2, 191, 0.43));
  assert.equal(gap.resetReason, 'GAP');
  assert.equal(gap.canMove, false);
  assert.deepEqual(gap.delta, { x: 0, y: 0 });
  const outlier = filter.update(input(3, 230, 0.6));
  assert.equal(outlier.resetReason, 'OUTLIER');
  assert.deepEqual(outlier.delta, { x: 0, y: 0 });
  const switched = filter.update(input(4, 270, 0.61, { handId: 'h2' }));
  assert.equal(switched.resetReason, 'HAND_CHANGED');
  assert.deepEqual(switched.delta, { x: 0, y: 0 });
  const normal = filter.update(input(5, 310, 0.62, { handId: 'h2' }));
  assert.equal(normal.canMove, true);
  assert.ok(normal.delta.x < 0.01);
});
test('loss, invalid geometry, stale/order frames clear prior motion; recovery and new sessions cannot reuse deltas', () => {
  for (const patch of [
    { handId: undefined, features: undefined },
    { features: { ...base, controlEligible: false } },
    {
      features: {
        ...base,
        controlEligible: true,
        palm: { x: NaN, y: 0, z: 0 },
      },
    },
    { resultTimeMs: 251 },
    { frameId: 0 },
    { captureTimeMs: 0 },
    { sessionId: '' },
    { frameId: NaN },
  ]) {
    const filter = new TemporalFilter();
    filter.update(input(0, 0));
    filter.update(input(1, 40, 0.42));
    assert.equal(filter.update(input(2, 100, 0.43, patch)), undefined);
    const recovered = filter.update(input(3, 140, 0.44));
    assert.equal(recovered.canMove, false);
    assert.deepEqual(recovered.delta, { x: 0, y: 0 });
  }
  const filter = new TemporalFilter();
  filter.update(input(10, 400));
  const reset = filter.update(input(0, 0, 0.6, { sessionId: 'new' }));
  assert.equal(reset.resetReason, 'FIRST');
  reset.palm.x = 999;
  const next = filter.update(input(1, 40, 0.61, { sessionId: 'new' }));
  assert.ok(next.palm.x < 1);
  filter.reset();
  assert.equal(filter.getMetrics().hasAnchor, false);
});
test('150ms age/gap boundary remains valid; stopped raw motion is never a reused previous raw delta', () => {
  const filter = new TemporalFilter();
  filter.update(input(0, 0));
  const boundary = filter.update(input(1, 150, 0.42, { resultTimeMs: 300 }));
  assert.equal(boundary.canMove, true);
  assert.equal(boundary.dtSeconds, 0.15);
  const stopped = filter.update(input(2, 190, 0.42));
  assert.deepEqual(stopped.rawDelta, { x: 0, y: 0 });
  assert.ok(stopped.delta.x >= 0); // EMA settling is explicit; mode mapping uses current raw motion to prevent inertia.
});
