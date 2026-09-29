import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GestureEngine, rotateDelta } from '../../src/gesture/index.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';
import { gestureFrame } from '../fixtures/gesture-frames.mjs';
function prime(engine) {
  const out = [];
  for (let i = 0; i < 4; i++)
    out.push(...engine.update(gestureFrame(i, i * 40)));
  return out;
}
test('fixed frame sequence emits START/UPDATE/END with no first-frame jump and stable source identity', () => {
  const engine = new GestureEngine();
  const start = prime(engine);
  assert.equal(start.length, 1);
  assert.equal(start[0].phase, 'START');
  assert.deepEqual(start[0].delta, { x: 0, y: 0 });
  const move = engine.update(gestureFrame(4, 160, { x: 0.37, y: 0.46 }));
  assert.equal(move[0].phase, 'UPDATE');
  assert.ok(move[0].delta.x > 0);
  assert.ok(move[0].delta.y > 0);
  assert.equal(move[0].sourceHandId, start[0].sourceHandId);
  assert.deepEqual(
    engine.update(gestureFrame(5, 200, { x: 0.37, y: 0.46 }))[0].delta,
    { x: 0, y: 0 },
  );
  for (let i = 6; i < 8; i++)
    assert.deepEqual(
      engine.update(gestureFrame(i, i * 40, { score: 0.4 })),
      [],
    );
  const end = engine.update(gestureFrame(8, 320, { score: 0.4 }));
  assert.equal(end[0].phase, 'END');
  assert.equal(end[0].delta, undefined);
  assert.equal(new Set([...start, ...move, ...end].map((i) => i.id)).size, 3);
});
test('one-frame candidates cannot rotate; hold threshold differs from enter threshold', () => {
  const engine = new GestureEngine();
  assert.deepEqual(engine.update(gestureFrame(0, 0)), []);
  assert.deepEqual(engine.update(gestureFrame(1, 40, { score: 0.6 })), []);
  for (let i = 2; i < 5; i++)
    assert.deepEqual(engine.update(gestureFrame(i, i * 40)), []);
  assert.equal(engine.update(gestureFrame(5, 200))[0].phase, 'START');
  assert.equal(
    engine.update(gestureFrame(6, 240, { score: 0.6, x: 0.36 }))[0].phase,
    'UPDATE',
  );
});
test('loss, stale/order/session errors and large gaps never reuse a prior movement', () => {
  for (const build of [
    () => ({ ...gestureFrame(4, 160), hands: [] }),
    () => ({ ...gestureFrame(4, 160), resultTimeMs: 311 }),
    () => gestureFrame(2, 80),
    () => gestureFrame(4, 160, { sessionId: 'wrong' }),
    () => gestureFrame(4, 300, { x: 0.37 }),
    () => gestureFrame(4, 160, { x: 0.45 }),
    () => ({ ...gestureFrame(4, 160), inferenceMs: NaN }),
  ]) {
    const engine = new GestureEngine();
    prime(engine);
    const stop = engine.update(build());
    assert.equal(stop.length, 1);
    assert.ok(['END', 'CANCEL'].includes(stop[0].phase));
    assert.equal(stop[0].delta, undefined);
    assert.ok(
      engine.update(gestureFrame(5, 340)).every((i) => i.phase !== 'UPDATE'),
    );
  }
  const engine = new GestureEngine();
  prime(engine);
  assert.equal(engine.reset('CAMERA_STOP')[0].phase, 'CANCEL');
  assert.deepEqual(engine.reset(), []);
  assert.deepEqual(engine.update(gestureFrame(0, 0, { sessionId: 'new' })), []);
});
test('rotation mapping uses speed deadzone, configured sign/gain/cap and stops raw motion without EMA inertia', () => {
  const sample = {
    canMove: true,
    dtSeconds: 0.04,
    delta: { x: 0.01, y: -0.02 },
    rawDelta: { x: 0.01, y: -0.02 },
  };
  const normal = rotateDelta(sample),
    inverse = rotateDelta(
      sample,
      parseConfig({ rotate: { invertX: true, invertY: true } }),
    );
  assert.equal(inverse.x, -normal.x);
  assert.equal(inverse.y, -normal.y);
  assert.deepEqual(rotateDelta({ ...sample, rawDelta: { x: 0, y: 0 } }), {
    x: 0,
    y: 0,
  });
  assert.deepEqual(rotateDelta({ ...sample, canMove: false }), { x: 0, y: 0 });
  assert.deepEqual(rotateDelta({ ...sample, dtSeconds: 0 }), { x: 0, y: 0 });
  assert.deepEqual(rotateDelta({ ...sample, dtSeconds: Number.MIN_VALUE }), {
    x: 0,
    y: 0,
  });
  const capped = rotateDelta({ ...sample, dtSeconds: 0.001 });
  assert.ok(
    Math.abs(capped.x) <=
      defaults.rotate.maxSpeed * 0.001 * defaults.rotate.yawGain,
  );
  assert.deepEqual(rotateDelta({ ...sample, delta: { x: NaN, y: Infinity } }), {
    x: 0,
    y: 0,
  });
});
test('steady 15Hz/30Hz paths converge to the same per-second rotation; both hands use identical model coordinates', () => {
  const run = (hz, handedness) => {
    const engine = new GestureEngine();
    let sum = 0;
    for (let i = 0; i <= hz * 4; i++) {
      const t = i / hz;
      for (const intent of engine.update(
        gestureFrame(i, t * 1000, { x: 0.25 + t * 0.1, handedness }),
      ))
        if (t > 3) sum += intent.delta?.x ?? 0;
    }
    return sum;
  };
  const slow = run(15, 'Right'),
    fast = run(30, 'Right');
  assert.ok(Math.abs(slow - fast) < 0.001);
  assert.ok(slow > 0);
  assert.equal(run(30, 'Left'), fast);
});
