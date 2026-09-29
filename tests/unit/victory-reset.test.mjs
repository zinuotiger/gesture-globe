import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GestureEngine } from '../../src/gesture/index.ts';
import { gestureFrame, pinchFrame } from '../fixtures/gesture-frames.mjs';
const frame = (id, options = {}) =>
  gestureFrame(id, id * 40, { gesture: 'Victory', ...options });
function feed(engine, from, to, context, make = frame) {
  const result = [];
  for (let i = from; i <= to; i++)
    result.push(...engine.update(make(i), context));
  return result;
}
const resets = (intents) => intents.filter((i) => i.kind === 'RESET');
test('Victory needs six stable frames and holding over two seconds triggers only once', () => {
  const e = new GestureEngine();
  assert.deepEqual(feed(e, 0, 4), []);
  const output = e.update(frame(5));
  assert.equal(output.length, 1);
  assert.equal(output[0].kind, 'RESET');
  assert.equal(output[0].phase, 'TRIGGER');
  assert.equal(output[0].confidence, 0.9);
  assert.equal(output[0].delta, undefined);
  assert.deepEqual(feed(e, 6, 60), []);
  assert.equal(e.getDebugState().victory.armed, false);
  assert.equal(e.getDebugState().candidate, 'Victory');
  e.update(frame(61, { gesture: 'None' }));
  assert.deepEqual(feed(e, 62, 66), []);
  assert.equal(resets(e.update(frame(67))).length, 1);
});
test('departure alone cannot bypass cooldown; another gesture is not globally blocked', () => {
  const e = new GestureEngine();
  feed(e, 0, 5);
  e.update(frame(6, { gesture: 'None' }));
  const motion = feed(e, 7, 10, undefined, (i) =>
    frame(i, { gesture: 'Open_Palm' }),
  );
  assert.equal(motion.at(-1).kind, 'ROTATE');
  assert.equal(motion.at(-1).phase, 'START');
  assert.equal(resets(feed(e, 11, 39)).length, 0);
  assert.equal(resets(e.update(frame(40))).length, 1);
});
test('manual source lock blocks candidates without pretending held Victory has departed', () => {
  const e = new GestureEngine();
  assert.deepEqual(feed(e, 0, 10, { manualInputLocked: true }), []);
  assert.deepEqual(feed(e, 11, 15), []);
  assert.equal(resets(e.update(frame(16))).length, 1);
  assert.deepEqual(feed(e, 17, 60, { manualInputLocked: true }), []);
  assert.deepEqual(feed(e, 61, 70), []);
  assert.equal(e.getDebugState().victory.armed, false);
  e.update(frame(71, { gesture: 'None' }));
  assert.equal(resets(feed(e, 72, 77)).length, 1);
});
test('Fist wins over Victory; Victory suppresses Pinch and rotation updates', () => {
  const both = (i) => {
    const f = frame(i);
    f.hands[0].gestures.push({ name: 'Closed_Fist', score: 0.9 });
    return f;
  };
  const e = new GestureEngine();
  assert.deepEqual(
    feed(e, 0, 20, undefined, both).map((i) => `${i.kind}:${i.phase}`),
    ['PAUSE:START'],
  );
  const z = new GestureEngine();
  feed(z, 0, 2, undefined, (i) => pinchFrame(i, i * 40));
  const output = feed(z, 3, 8, undefined, (i) =>
    pinchFrame(i, i * 40, 0.29, { gesture: 'Victory' }),
  );
  assert.deepEqual(
    output.map((i) => `${i.kind}:${i.phase}`),
    ['ZOOM:END', 'RESET:TRIGGER'],
  );
});
test('sub-threshold noise interrupts candidate; invalid/stale input cannot rearm held trigger', () => {
  const e = new GestureEngine();
  feed(e, 0, 4);
  e.update(frame(5, { score: 0.77 }));
  assert.deepEqual(feed(e, 6, 10), []);
  assert.equal(resets(e.update(frame(11))).length, 1);
  const bad = frame(12);
  bad.resultTimeMs += 200;
  assert.deepEqual(e.update(bad), []);
  assert.deepEqual(feed(e, 13, 60), []);
  e.reset('NEW_SESSION');
  assert.equal(resets(feed(e, 0, 5)).length, 1);
});
