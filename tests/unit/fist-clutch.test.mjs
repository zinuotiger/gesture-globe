import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GestureEngine } from '../../src/gesture/index.ts';
import { gestureFrame } from '../fixtures/gesture-frames.mjs';
function frame(id, at, x = 0.35, fist = 0.9) {
  const f = gestureFrame(id, at, { x });
  f.hands[0].gestures.push({ name: 'Closed_Fist', score: fist });
  return f;
}
function active() {
  const e = new GestureEngine();
  for (let i = 0; i < 4; i++) e.update(gestureFrame(i, i * 40));
  return e;
}
test('two stable fist frames preempt rotation: CANCEL precedes PAUSE START and no tail UPDATE survives', () => {
  const e = active();
  assert.deepEqual(e.update(frame(4, 160, 0.36)), []);
  const stopped = e.update(frame(5, 200, 0.37));
  assert.deepEqual(
    stopped.map((i) => `${i.kind}:${i.phase}`),
    ['ROTATE:CANCEL', 'PAUSE:START'],
  );
  assert.ok(stopped.every((i) => i.delta === undefined));
  assert.equal(e.getDebugState().phase, 'PAUSED');
  assert.equal(e.getDebugState().clutchPaused, true);
  for (let i = 6; i < 26; i++)
    assert.deepEqual(e.update(frame(i, i * 40, 0.37 + (i - 5) * 0.01)), []);
  assert.equal(e.getDebugState().candidate, 'Closed_Fist');
});
test('release is a clutch, not a toggle: repositioning during pause cannot leak delta into fresh rotation', () => {
  const e = active();
  e.update(frame(4, 160));
  e.update(frame(5, 200));
  for (let i = 6; i < 16; i++)
    e.update(frame(i, i * 40, 0.35 + (i - 5) * 0.02));
  assert.deepEqual(e.update(frame(16, 640, 0.55, 0)), []);
  assert.deepEqual(e.update(frame(17, 680, 0.55, 0)), []);
  assert.deepEqual(
    e.update(frame(18, 720, 0.55, 0)).map((i) => `${i.kind}:${i.phase}`),
    ['PAUSE:END'],
  );
  for (let i = 19; i < 22; i++)
    assert.deepEqual(e.update(gestureFrame(i, i * 40, { x: 0.55 })), []);
  const start = e.update(gestureFrame(22, 880, { x: 0.55 }));
  assert.equal(start[0].phase, 'START');
  assert.deepEqual(start[0].delta, { x: 0, y: 0 });
  assert.deepEqual(e.update(gestureFrame(23, 920, { x: 0.55 }))[0].delta, {
    x: 0,
    y: 0,
  });
});
test('single-frame fist noise does not latch; held fist from idle emits one pause; loss/reset close pause explicitly', () => {
  const e = active();
  e.update(frame(4, 160));
  assert.equal(e.update(gestureFrame(5, 200, { x: 0.36 }))[0].phase, 'UPDATE');
  assert.equal(e.getDebugState().clutchPaused, false);
  const idle = new GestureEngine();
  assert.deepEqual(idle.update(frame(0, 0)), []);
  assert.deepEqual(
    idle.update(frame(1, 40)).map((i) => `${i.kind}:${i.phase}`),
    ['PAUSE:START'],
  );
  const noHand = { ...gestureFrame(2, 80), hands: [] };
  assert.deepEqual(
    idle.update(noHand).map((i) => `${i.kind}:${i.phase}`),
    ['PAUSE:END'],
  );
  idle.update(frame(3, 120));
  idle.update(frame(4, 160));
  assert.deepEqual(
    idle.reset('CAMERA_STOP').map((i) => `${i.kind}:${i.phase}`),
    ['PAUSE:CANCEL'],
  );
  assert.deepEqual(idle.reset(), []);
});
test('invalid/stale/session interruption cancels a paused gesture and demands a fresh fist candidate', () => {
  for (const bad of [
    { ...frame(2, 80), resultTimeMs: 231 },
    { ...frame(2, 80), sessionId: 'wrong' },
    { ...frame(2, 80), inferenceMs: NaN },
  ]) {
    const e = new GestureEngine();
    e.update(frame(0, 0));
    e.update(frame(1, 40));
    const output = e.update(bad);
    assert.deepEqual(
      output.map((i) => `${i.kind}:${i.phase}`),
      ['PAUSE:CANCEL'],
    );
    assert.equal(e.getDebugState().clutchPaused, false);
    assert.deepEqual(e.update(frame(3, 120)), []);
    assert.deepEqual(
      e.update(frame(4, 160)).map((i) => `${i.kind}:${i.phase}`),
      ['PAUSE:START'],
    );
  }
});
