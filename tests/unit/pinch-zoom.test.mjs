import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  GestureEngine,
  pinchConditions,
  zoomDelta,
  extractFeatures,
} from '../../src/gesture/index.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';
import { pinchFrame, gestureFrame } from '../fixtures/gesture-frames.mjs';
function prime(engine) {
  const out = [];
  for (let i = 0; i < 3; i++) out.push(...engine.update(pinchFrame(i, i * 40)));
  return out;
}
test('pinch geometry uses explicit inclusive entry/exclusive hold limits and rejects invalid or degenerate palms', () => {
  const features = extractFeatures(pinchFrame(0, 0).hands[0], 0);
  assert.deepEqual(pinchConditions(0.3, features), { enter: true, hold: true });
  assert.deepEqual(pinchConditions(0.35, features), {
    enter: false,
    hold: true,
  });
  assert.deepEqual(pinchConditions(0.4, features), {
    enter: false,
    hold: false,
  });
  for (const ratio of [-1, NaN, Infinity])
    assert.deepEqual(pinchConditions(ratio, features), {
      enter: false,
      hold: false,
    });
  assert.equal(
    pinchConditions(0.1, { ...features, palmWidth: 0 }).enter,
    false,
  );
  assert.equal(pinchConditions(0.1, undefined).enter, false);
});
test('three stable pinch frames start with zero zoom; only palm Y movement controls zoom, never finger gap', () => {
  const engine = new GestureEngine();
  const start = prime(engine);
  assert.deepEqual(
    start.map((i) => `${i.kind}:${i.phase}`),
    ['ZOOM:START'],
  );
  assert.deepEqual(start[0].delta, { x: 0, y: 0 });
  const moved = engine.update(pinchFrame(3, 120, 0.29, { y: 0.47 }));
  assert.equal(moved[0].kind, 'ZOOM');
  assert.ok(moved[0].delta.y > 0);
  assert.equal(moved[0].delta.x, 0);
  assert.deepEqual(
    engine.update(pinchFrame(4, 160, 0.2, { y: 0.47 }))[0].delta,
    { x: 0, y: 0 },
  );
  assert.deepEqual(
    engine.update(pinchFrame(5, 200, 0.35, { y: 0.47 }))[0].delta,
    { x: 0, y: 0 },
  );
});
test('filtered ratio hysteresis holds the middle band and releases once after sustained exit frames', () => {
  const engine = new GestureEngine();
  prime(engine);
  for (let i = 3; i < 20; i++)
    assert.equal(engine.update(pinchFrame(i, i * 40, 0.35))[0].phase, 'UPDATE');
  const exits = [];
  for (let i = 20; i < 40; i++)
    exits.push(...engine.update(pinchFrame(i, i * 40, 0.41)));
  assert.equal(
    exits.filter((i) => i.phase === 'END' && i.kind === 'ZOOM').length,
    1,
  );
  assert.equal(exits.filter((i) => i.phase === 'START').length, 0);
});
test('pinch takes rotation ownership without a jump; fist cancels zoom before PAUSE and loss ends zoom', () => {
  const engine = new GestureEngine();
  for (let i = 0; i < 4; i++) engine.update(gestureFrame(i, i * 40));
  const takeover = [];
  for (let i = 4; i < 24; i++)
    takeover.push(
      ...engine.update(pinchFrame(i, i * 40, 0.1, { gesture: 'Open_Palm' })),
    );
  const start = takeover.findIndex(
    (i) => i.kind === 'ZOOM' && i.phase === 'START',
  );
  assert.ok(start > 0);
  assert.equal(takeover[start - 1].phase, 'CANCEL');
  assert.equal(takeover[start - 1].kind, 'ROTATE');
  assert.deepEqual(takeover[start].delta, { x: 0, y: 0 });
  const fist = (id) => {
    const f = pinchFrame(id, id * 40, 0.1);
    f.hands[0].gestures.push({ name: 'Closed_Fist', score: 0.9 });
    return f;
  };
  assert.deepEqual(engine.update(fist(24)), []);
  assert.deepEqual(
    engine.update(fist(25)).map((i) => `${i.kind}:${i.phase}`),
    ['ZOOM:CANCEL', 'PAUSE:START'],
  );
  const lost = new GestureEngine();
  prime(lost);
  assert.deepEqual(
    lost
      .update({ ...pinchFrame(3, 120), hands: [] })
      .map((i) => `${i.kind}:${i.phase}`),
    ['ZOOM:END'],
  );
});
test('zoom sign, gain, speed cap and raw stop remain finite; reset/stale input cancels zoom', () => {
  const sample = {
    canMove: true,
    dtSeconds: 0.04,
    delta: { x: 0, y: 0.02 },
    rawDelta: { x: 0, y: 0.02 },
  };
  assert.ok(zoomDelta(sample) > 0);
  assert.equal(
    zoomDelta(sample, parseConfig({ zoom: { invert: true } })),
    -zoomDelta(sample),
  );
  assert.equal(zoomDelta({ ...sample, rawDelta: { x: 0, y: 0 } }), 0);
  for (const dt of [0, NaN, Number.MIN_VALUE])
    assert.equal(zoomDelta({ ...sample, dtSeconds: dt }), 0);
  const capped = zoomDelta({ ...sample, dtSeconds: 0.001 });
  assert.ok(capped <= defaults.zoom.maxSpeed * 0.001 * defaults.zoom.gain);
  const e = new GestureEngine();
  prime(e);
  assert.equal(e.reset()[0].kind, 'ZOOM');
  prime(e);
  assert.deepEqual(
    e
      .update({ ...pinchFrame(3, 120), resultTimeMs: 271 })
      .map((i) => `${i.kind}:${i.phase}`),
    ['ZOOM:CANCEL'],
  );
});
