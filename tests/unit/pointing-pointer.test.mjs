import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GestureEngine } from '../../src/gesture/index.ts';
import { defaults } from '../../src/config/index.ts';
import { gestureFrame, pinchFrame } from '../fixtures/gesture-frames.mjs';
const frame = (i, options = {}) =>
  gestureFrame(i, i * 40, { gesture: 'Pointing_Up', ...options });
test('Pointing emits normalized landmark-8 EMA pointer, never a selection trigger or location', () => {
  const e = new GestureEngine();
  const first = frame(0);
  const start = e.update(first);
  assert.deepEqual(
    start.map((i) => `${i.kind}:${i.phase}`),
    ['SELECT:START'],
  );
  const tip = first.hands[0].landmarks[8];
  assert.deepEqual(start[0].pointer, { x: tip.x, y: tip.y });
  assert.equal(start[0].delta, undefined);
  const next = frame(1, { x: 0.36 });
  const update = e.update(next)[0];
  const expected =
    tip.x * (1 - defaults.gesture.pointerAlpha) +
    next.hands[0].landmarks[8].x * defaults.gesture.pointerAlpha;
  assert.equal(update.pointer.x, expected);
  assert.equal(update.phase, 'UPDATE');
  assert.equal(e.getDebugState().candidate, 'Pointing_Up');
  for (let i = 2; i < 100; i++) {
    const result = e.update(frame(i));
    assert.equal(result.length, 1);
    assert.equal(result[0].phase, 'UPDATE');
    assert.equal('selectionId' in result[0], false);
    assert.equal('latitude' in result[0], false);
  }
});
test('low score and hand loss end immediately, once; re-entry starts a new pointer stream', () => {
  const e = new GestureEngine();
  e.update(frame(0));
  assert.deepEqual(
    e.update(frame(1, { score: 0.71 })).map((i) => i.phase),
    ['END'],
  );
  assert.deepEqual(e.update(frame(2, { score: 0.71 })), []);
  assert.equal(e.update(frame(3))[0].phase, 'START');
  const end = e.update({ ...frame(4), hands: [] });
  assert.equal(end[0].phase, 'END');
  assert.equal(end[0].pointer, undefined);
  assert.deepEqual(e.update({ ...frame(5), hands: [] }), []);
  assert.equal(e.update(frame(6))[0].phase, 'START');
});
test('all higher priority candidates cancel Pointing without tail pointer; Pointing preempts Palm', () => {
  for (const name of ['Closed_Fist', 'Victory']) {
    const e = new GestureEngine();
    e.update(frame(0));
    const higher = frame(1);
    higher.hands[0].gestures.push({ name, score: 0.9 });
    assert.deepEqual(
      e.update(higher).map((i) => `${i.kind}:${i.phase}`),
      ['SELECT:CANCEL'],
    );
  }
  const p = new GestureEngine();
  p.update(pinchFrame(0, 0, 0.35, { gesture: 'Pointing_Up' }));
  const cancelled = p.update(pinchFrame(1, 40, 0, { gesture: 'Pointing_Up' }));
  assert.deepEqual(
    cancelled.map((i) => `${i.kind}:${i.phase}`),
    ['SELECT:CANCEL'],
  );
  const e = new GestureEngine();
  for (let i = 0; i < 4; i++) e.update(gestureFrame(i, i * 40));
  const mixed = frame(4);
  mixed.hands[0].gestures.push({ name: 'Open_Palm', score: 0.99 });
  assert.deepEqual(
    e.update(mixed).map((i) => `${i.kind}:${i.phase}`),
    ['ROTATE:CANCEL', 'SELECT:START'],
  );
});
test('reset, stale, frame gap, outlier and invalid geometry cannot reuse a previous pointer', () => {
  const badFrames = [
    { ...frame(1), resultTimeMs: 191 },
    { ...frame(1), captureTimeMs: 200, resultTimeMs: 201 },
    frame(1, { x: 0.41 }),
    frame(1, { x: -0.1 }),
  ];
  for (const bad of badFrames) {
    const e = new GestureEngine();
    e.update(frame(0));
    const output = e.update(bad);
    assert.equal(output.length, 1);
    assert.ok(['CANCEL', 'END'].includes(output[0].phase));
    assert.equal(output[0].pointer, undefined);
    assert.equal(e.getDebugState().pointingActive, false);
  }
  const e = new GestureEngine();
  e.update(frame(0));
  assert.equal(e.reset('STOP')[0].phase, 'CANCEL');
  assert.deepEqual(e.reset(), []);
});
test('pointer coordinate is unmirrored and independent of handedness; output mutation cannot poison smoothing', () => {
  const a = new GestureEngine(),
    b = new GestureEngine();
  const left = a.update(frame(0, { handedness: 'Left' }))[0];
  const right = b.update(frame(0, { handedness: 'Right' }))[0];
  assert.deepEqual(left.pointer, right.pointer);
  left.pointer.x = 900;
  assert.deepEqual(
    a.update(frame(1))[0].pointer,
    b.update(frame(1))[0].pointer,
  );
});
