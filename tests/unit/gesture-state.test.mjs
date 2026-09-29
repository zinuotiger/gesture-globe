import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GestureStateMachine } from '../../src/gesture/index.ts';
import { defaults } from '../../src/config/index.ts';
const continuous = () =>
  new GestureStateMachine({
    stableFrames: defaults.openPalm.stableFrames,
    releaseFrames: defaults.gesture.releaseFrames,
    discrete: false,
    cooldownMs: 0,
  });
const discrete = () =>
  new GestureStateMachine({
    stableFrames: defaults.victory.stableFrames,
    releaseFrames: defaults.gesture.releaseFrames,
    discrete: true,
    cooldownMs: defaults.victory.cooldownMs,
  });
const step = (machine, atMs, patch = {}) =>
  machine
    .step({ atMs, present: true, enter: true, hold: true, ...patch })
    .map((t) => t.phase);
function activate(machine, start = 0, count = 4) {
  const outputs = [];
  for (let i = 0; i < count; i++)
    outputs.push(...step(machine, start + i * 40));
  return outputs;
}
test('stable entry, hold hysteresis, release recovery and final END are explicit', () => {
  const m = continuous();
  assert.equal(m.getState().phase, 'NO_HAND');
  assert.deepEqual(step(m, 0, { enter: false }), []);
  assert.equal(m.getState().phase, 'IDLE');
  assert.deepEqual(activate(m, 40), ['START']);
  assert.equal(m.getState().phase, 'ACTIVE');
  assert.deepEqual(step(m, 200, { enter: false, hold: true }), ['UPDATE']);
  assert.deepEqual(step(m, 240, { enter: false, hold: false }), []);
  assert.equal(m.getState().phase, 'RELEASING');
  assert.deepEqual(step(m, 280, { enter: false, hold: true }), ['UPDATE']);
  assert.equal(m.getState().releaseFrames, 0);
  assert.deepEqual(step(m, 320, { enter: false, hold: false }), []);
  assert.deepEqual(step(m, 360, { enter: false, hold: false }), []);
  assert.deepEqual(step(m, 400, { enter: false, hold: false }), ['END']);
  assert.equal(m.getState().phase, 'IDLE');
  assert.deepEqual(step(m, 440, { enter: false, hold: false }), []);
});
test('candidate interruption restarts stability; hand loss ends active motion immediately and only once', () => {
  const m = continuous();
  assert.deepEqual(activate(m, 0, 3), []);
  step(m, 120, { enter: false, hold: false });
  assert.equal(m.getState().stableFrames, 0);
  assert.deepEqual(activate(m, 160), ['START']);
  assert.deepEqual(step(m, 320, { present: false }), ['END']);
  assert.equal(m.getState().phase, 'NO_HAND');
  assert.deepEqual(step(m, 360, { present: false }), []);
  assert.deepEqual(activate(m, 400), ['START']);
});
test('clutch pause returns CANCEL before PAUSED, emits no tail updates, and resume requires fresh stable entry', () => {
  const m = continuous();
  activate(m);
  assert.deepEqual(
    m.pause(160).map((t) => t.phase),
    ['CANCEL'],
  );
  assert.equal(m.getState().phase, 'PAUSED');
  for (let i = 0; i < 10; i++) assert.deepEqual(step(m, 200 + i * 40), []);
  assert.deepEqual(m.pause(600), []);
  m.resume();
  assert.equal(m.getState().phase, 'IDLE');
  assert.deepEqual(activate(m, 640), ['START']);
  assert.deepEqual(
    m.cancel(800).map((t) => t.phase),
    ['CANCEL'],
  );
  assert.deepEqual(m.cancel(800), []);
  m.pause(810);
  assert.deepEqual(step(m, 840, { present: false }), []);
  assert.equal(m.getState().phase, 'NO_HAND');
});
test('discrete trigger requires stable rising edge, cooldown AND departure; holding never repeats', () => {
  const m = discrete();
  assert.deepEqual(activate(m, 0, 6), ['TRIGGER']);
  assert.equal(m.getState().armed, false);
  for (let t = 240; t <= 2400; t += 40) assert.deepEqual(step(m, t), []);
  assert.equal(m.getState().armed, false);
  step(m, 2440, { enter: false, hold: false });
  assert.equal(m.getState().armed, true);
  assert.deepEqual(activate(m, 2480, 6), ['TRIGGER']);
  step(m, 2720, { present: false });
  assert.equal(m.getState().armed, false);
  for (let t = 2760; t < 3880; t += 40) assert.deepEqual(step(m, t), []);
  assert.deepEqual(activate(m, 3880, 6), ['TRIGGER']);
});
test('one rule cooldown does not block another; configuration, duplicate times and resets fail safely', () => {
  const d = discrete(),
    c = continuous();
  activate(d, 0, 6);
  assert.deepEqual(activate(c, 240), ['START']);
  assert.deepEqual(step(c, 360), ['CANCEL']);
  assert.equal(c.getState().phase, 'IDLE');
  assert.deepEqual(step(c, NaN), []);
  c.reset();
  assert.deepEqual(activate(c, 0), ['START']);
  assert.throws(() => {
    c.getState().phase = 'IDLE';
  });
  for (const patch of [
    { stableFrames: 0 },
    { stableFrames: 1.5 },
    { releaseFrames: 0 },
    { cooldownMs: -1 },
    { cooldownMs: Infinity },
    { discrete: 'yes' },
  ])
    assert.throws(
      () =>
        new GestureStateMachine({
          stableFrames: 4,
          releaseFrames: 3,
          discrete: false,
          cooldownMs: 0,
          ...patch,
        }),
    );
});
