import assert from 'node:assert/strict';
import { test } from 'vitest';
import { normalizeResult, isVisionFrame } from '../../src/vision/index.ts';
const metadata = {
  schemaVersion: 1,
  sessionId: 'fixture',
  frameId: 7,
  captureTimeMs: 100,
  source: { width: 1280, height: 720 },
};
const category = (categoryName, score) => ({
  categoryName,
  score,
  index: 0,
  displayName: 'not exported',
});
const raw = () => ({
  landmarks: [
    Array.from({ length: 21 }, (_, i) => ({
      x: i / 20,
      y: 1 - i / 40,
      z: -i / 100,
      visibility: 0.99,
    })),
  ],
  worldLandmarks: [
    Array.from({ length: 21 }, (_, i) => ({ x: i, y: i, z: -i })),
  ],
  handedness: [[category('Right', 0.2), category('Left', 0.9)]],
  gestures: [[category('Closed_Fist', 0.1), category('Open_Palm', 0.8)]],
});
test('normalizer copies exactly 21 numeric points/classification/bbox without SDK private fields or mirroring', () => {
  const input = raw();
  const frame = normalizeResult(input, metadata, 115, 10);
  assert.equal(isVisionFrame(frame), true);
  assert.equal(frame.hands[0].landmarks.length, 21);
  assert.deepEqual(frame.hands[0].bbox, {
    x: 0,
    y: 0.5,
    width: 1,
    height: 0.5,
  });
  assert.equal(frame.hands[0].handedness, 'Left');
  assert.equal(frame.hands[0].handednessScore, 0.9);
  assert.deepEqual(frame.hands[0].gestures, [
    { name: 'Open_Palm', score: 0.8 },
    { name: 'Closed_Fist', score: 0.1 },
  ]);
  assert.equal(frame.hands[0].landmarks[8].x, 0.4);
  assert.equal('worldLandmarks' in frame.hands[0], false);
  assert.equal('visibility' in frame.hands[0].landmarks[0], false);
  input.landmarks[0][0].x = 99;
  input.gestures[0][0].score = 1;
  assert.equal(frame.hands[0].landmarks[0].x, 0);
  assert.deepEqual(globalThis.structuredClone(frame), frame);
});
test('empty recognition remains genuinely empty; optional world data and temporary slot ids are bounded', () => {
  assert.deepEqual(
    normalizeResult(
      { landmarks: [], worldLandmarks: [], handedness: [], gestures: [] },
      metadata,
      100,
      0,
    ).hands,
    [],
  );
  const input = raw();
  input.handedness = [[]];
  input.landmarks[0][0].x = -0.1;
  const frame = normalizeResult(input, metadata, 101, 1, {
    numHands: 1,
    worldLandmarks: true,
  });
  assert.equal(frame.hands[0].handedness, 'Unknown');
  assert.equal(frame.hands[0].handednessScore, 0);
  assert.equal(frame.hands[0].bbox.x, -0.1);
  assert.equal(frame.hands[0].worldLandmarks.length, 21);
  input.worldLandmarks[0][0].x = 88;
  assert.equal(frame.hands[0].worldLandmarks[0].x, 0);
  input.landmarks.push(input.landmarks[0]);
  input.worldLandmarks.push([]);
  input.handedness.push([]);
  input.gestures.push([]);
  const two = normalizeResult(input, metadata, 102, 1, {
    numHands: 2,
    worldLandmarks: false,
  });
  assert.equal(two.hands.length, 2);
  assert.notEqual(two.hands[0].localId, two.hands[1].localId);
});
test('corrupt SDK values fail explicitly rather than fabricate points or a successful empty detection', () => {
  for (const mutate of [
    (r) => r.landmarks[0].pop(),
    (r) => (r.landmarks[0][0].x = NaN),
    (r) => (r.gestures[0][0].score = 2),
    (r) => r.landmarks.push(r.landmarks[0]),
  ]) {
    const value = raw();
    mutate(value);
    assert.throws(() => normalizeResult(value, metadata, 101, 1));
  }
  assert.throws(() => normalizeResult(raw(), metadata, 99, 1));
  assert.throws(() => normalizeResult(raw(), metadata, 101, Infinity));
});
