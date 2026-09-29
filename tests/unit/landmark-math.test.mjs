import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  distance,
  palmCenter,
  palmWidth,
  bbox,
  pinchRatio,
  velocity,
  validLandmarks,
} from '../../src/shared/index.ts';
import { extractFeatures } from '../../src/gesture/index.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';
import { syntheticFrame } from '../fixtures/vision-sequences.mjs';
const hand = () => syntheticFrame().hands[0];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test('pure geometry matches the documented indices and normalized image-plane units', () => {
  const points = hand().landmarks;
  near(distance({ x: 0, y: 0, z: 100 }, { x: 3, y: 4, z: -100 }), 5);
  const center = palmCenter(points);
  const indices = [0, 5, 9, 13, 17];
  near(center.x, indices.reduce((s, i) => s + points[i].x, 0) / 5);
  near(center.y, indices.reduce((s, i) => s + points[i].y, 0) / 5);
  near(palmWidth(points), distance(points[5], points[17]));
  near(
    pinchRatio(points, 1e-6),
    distance(points[4], points[8]) / palmWidth(points),
  );
  const bounds = bbox(points);
  near(bounds.x, 0.3);
  near(bounds.width, 0.2);
  near(bounds.height, 0.2);
  assert.deepEqual(velocity({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }, 100), {
    x: 3,
    y: 4,
    speed: 5,
  });
});
test('left/right reflection and scale preserve width/pinch while palm and pointer transform predictably', () => {
  const right = hand();
  const left = globalThis.structuredClone(right);
  left.handedness = 'Left';
  left.landmarks = left.landmarks.map((p) => ({ ...p, x: 1 - p.x }));
  const r = extractFeatures(right, 100),
    l = extractFeatures(left, 100);
  near(r.palmWidth, l.palmWidth);
  near(r.pinchRatio, l.pinchRatio);
  near(r.palm.x + l.palm.x, 1);
  near(r.pointer.x + l.pointer.x, 1);
  const scaled = right.landmarks.map((p) => ({
    x: p.x * 2,
    y: p.y * 2,
    z: p.z * 2,
  }));
  near(pinchRatio(scaled, 1e-6), r.pinchRatio);
  const original = globalThis.structuredClone(right);
  r.pointer.x = 999;
  r.palm.y = 999;
  assert.deepEqual(right, original);
});
test('null, incomplete, nonfinite and extreme input never produces NaN or Infinity', () => {
  const invalid = [
    null,
    undefined,
    [],
    hand().landmarks.slice(1),
    Array(21).fill({ x: 0, y: 0, z: NaN }),
    Array(21).fill({ x: 0, y: Infinity, z: 0 }),
  ];
  for (const points of invalid) {
    assert.equal(validLandmarks(points), false);
    assert.equal(palmCenter(points), undefined);
    assert.equal(palmWidth(points), undefined);
    assert.equal(bbox(points), undefined);
    assert.equal(pinchRatio(points, 1e-6), undefined);
    assert.equal(
      extractFeatures({ ...hand(), landmarks: points }, 0),
      undefined,
    );
  }
  assert.equal(distance(null, { x: 0, y: 0 }), undefined);
  assert.equal(distance({ x: -1e308, y: 0 }, { x: 1e308, y: 0 }), undefined);
  const huge = hand().landmarks;
  huge[0].x = -1e308;
  huge[1].x = 1e308;
  assert.equal(bbox(huge), undefined);
  assert.equal(extractFeatures({ ...hand(), landmarks: huge }, 0), undefined);
  for (const epsilon of [0, -1, NaN, Infinity])
    assert.equal(pinchRatio(hand().landmarks, epsilon), undefined);
  const hugeWidth = hand().landmarks;
  hugeWidth[5].x = -1e308;
  hugeWidth[17].x = 1e308;
  assert.equal(pinchRatio(hugeWidth, 1e-6), undefined);
  const hugeGap = hand().landmarks;
  hugeGap[4].x = -1e308;
  hugeGap[8].x = 1e308;
  assert.equal(pinchRatio(hugeGap, 1e-6), undefined);
  for (const dt of [0, -1, NaN, Infinity])
    assert.equal(velocity({ x: 0, y: 0 }, { x: 1, y: 1 }, dt), undefined);
  assert.equal(velocity(null, { x: 1, y: 1 }, 10), undefined);
  assert.equal(velocity({ x: 0, y: 0 }, { x: 1e308, y: 1e308 }, 1), undefined);
  for (const at of [-1, NaN, Infinity])
    assert.equal(extractFeatures(hand(), at), undefined);
  assert.equal(extractFeatures(null, 0), undefined);
});
test('degenerate palm, distance/size and completeness yield explicit non-controlling feedback', () => {
  const normal = hand();
  normal.landmarks = normal.landmarks.map((p) => ({
    ...p,
    x: 0.2 + (p.x - 0.3) * 1.5,
    y: 0.2 + (p.y - 0.3) * 1.5,
  }));
  const valid = extractFeatures(normal, 100);
  assert.equal(valid.reason, 'READY');
  assert.equal(valid.controlEligible, true);
  near(valid.completeness, 1);
  const moved = globalThis.structuredClone(normal);
  moved.landmarks = moved.landmarks.map((p) => ({ ...p, x: p.x + 0.01 }));
  const result = extractFeatures(moved, 200, { palm: valid.palm, atMs: 100 });
  near(result.velocity.x, 0.1);
  assert.equal(
    extractFeatures(moved, 100, { palm: valid.palm, atMs: 100 }).velocity,
    undefined,
  );
  const tiny = hand();
  tiny.landmarks = tiny.landmarks.map((p) => ({
    ...p,
    x: p.x * 0.1,
    y: p.y * 0.1,
  }));
  assert.equal(extractFeatures(tiny, 0).reason, 'TOO_FAR');
  const large = hand();
  large.landmarks = large.landmarks.map((p) => ({
    ...p,
    x: (p.x - 0.3) * 4,
    y: (p.y - 0.3) * 4,
  }));
  assert.equal(extractFeatures(large, 0).reason, 'TOO_CLOSE');
  const outside = globalThis.structuredClone(normal);
  outside.landmarks[8].x = -0.01;
  const clipped = extractFeatures(outside, 0);
  assert.equal(clipped.reason, 'OUT_OF_FRAME');
  near(clipped.completeness, 20 / 21);
  const zero = hand();
  zero.landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  zero.landmarks[4].x = 0.6;
  const degenerate = extractFeatures(zero, 0);
  assert.equal(degenerate.reason, 'PALM_TOO_SMALL');
  assert.ok(Number.isFinite(degenerate.pinchRatio));
  assert.equal(degenerate.controlEligible, false);
  assert.equal(
    extractFeatures(normal, 0, undefined, defaults).velocity,
    undefined,
  );
  assert.throws(() =>
    parseConfig({ handQuality: { minBboxArea: 0.2, maxBboxArea: 0.2 } }),
  );
});
