import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  CommandRateLimiter,
  Deduplicator,
} from '../../src/interaction/index.ts';
import { defaults } from '../../src/config/index.ts';
import { isGlobeCommand } from '../../src/globe/index.ts';
const rotate = (id, at, yaw = 0.001, dt = 0.001, traceId = 't') => ({
  schemaVersion: 1,
  type: 'ROTATE',
  id,
  at,
  yaw,
  pitch: 0,
  dt,
  traceId,
});
const reset = (id, at) => ({ schemaVersion: 1, type: 'RESET_VIEW', id, at });
test('1000Hz input coalesces into bounded rate and two slots with no lost small movement or frame queue', () => {
  const buffer = new CommandRateLimiter();
  let emitted = [],
    flushes = 0;
  for (let t = 0; t < 10000; t++) {
    assert.equal(
      buffer.push(rotate(`r-${t}`, t, 0.00001), 'mouse', t).accepted,
      true,
    );
    const commands = buffer.flush(t);
    if (commands.length) flushes++;
    emitted.push(...commands);
    assert.ok(buffer.getMetrics().pending <= 2);
  }
  emitted.push(...buffer.flush(10020));
  assert.ok(flushes <= 600);
  assert.ok(Math.abs(emitted.reduce((sum, c) => sum + c.yaw, 0) - 0.1) < 1e-10);
  assert.ok(emitted.every(isGlobeCommand));
  assert.equal(buffer.getMetrics().pending, 0);
  assert.ok(
    buffer.getMetrics().motionIds <= defaults.interaction.maxDiscreteIds,
  );
});
test('discrete events execute immediately once; motion traffic cannot evict discrete dedup entries', () => {
  const buffer = new CommandRateLimiter();
  assert.equal(buffer.push(reset('reset', 0), 'ui', 0).commands.length, 1);
  for (let i = 0; i < 1000; i++)
    buffer.push(rotate(`r-${i}`, i / 10), 'mouse', i / 10);
  const duplicate = buffer.push(reset('reset', 0), 'ui', 100);
  assert.equal(duplicate.reason, 'DUPLICATE');
  assert.equal(duplicate.commands.length, 0);
  assert.equal(buffer.getMetrics().pending, 1);
  assert.equal(buffer.push(reset('next', 100), 'ui', 100).commands.length, 1);
  assert.equal(buffer.getMetrics().pending, 0);
});
test('source/trace changes cannot combine old motion; cancellation prevents delayed tail updates', () => {
  const b = new CommandRateLimiter();
  b.push(rotate('g', 0, 0.01, 0.04, 'old'), 'gesture', 0);
  b.push(rotate('m', 1, -0.01, 0.04, 'new'), 'mouse', 1);
  const c = b.flush(1)[0];
  assert.equal(c.yaw, -0.01);
  assert.equal(c.traceId, 'new');
  b.push(rotate('m2', 2, 0.01, 0.04, 'other'), 'mouse', 2);
  b.cancel('gesture');
  assert.equal(b.getMetrics().pending, 1);
  b.cancel('mouse');
  assert.deepEqual(b.flush(30), []);
  b.push(rotate('a', 31, 0.02, 0.04, 'a'), 'mouse', 31);
  b.push(rotate('b', 32, 0.01, 0.04, 'b'), 'mouse', 32);
  assert.equal(b.flush(32)[0].yaw, 0.01);
});
test('stale aggregates, duplicate/out-of-order input and invalid clocks are rejected; saturation remains finite', () => {
  const b = new CommandRateLimiter();
  const first = rotate('1', 10);
  b.push(first, 'gesture', 10);
  assert.equal(b.push(first, 'gesture', 10).reason, 'DUPLICATE');
  assert.equal(b.push(rotate('old', 9), 'gesture', 10).reason, 'INVALID');
  assert.deepEqual(b.flush(161), []);
  assert.equal(b.getMetrics().stale, 1);
  assert.equal(b.push(rotate('late', 0), 'gesture', 162).reason, 'STALE');
  assert.equal(b.push(rotate('future', 200), 'mouse', 162).reason, 'INVALID');
  assert.equal(b.push(rotate('bad', 163, NaN), 'mouse', 163).reason, 'INVALID');
  assert.deepEqual(b.flush(NaN), []);
  b.push(rotate('huge1', 164, Number.MAX_VALUE, 1), 'mouse', 164);
  b.push(rotate('huge2', 165, Number.MAX_VALUE, 1), 'mouse', 165);
  const bounded = b.flush(165)[0];
  assert.ok(isGlobeCommand(bounded));
  assert.ok(Math.abs(bounded.yaw - 0.3) < 1e-12);
  b.dispose();
  assert.equal(b.push(reset('x', 166), 'ui', 166).reason, 'DISPOSED');
  assert.deepEqual(b.flush(167), []);
});
test('dedup capacity is explicit FIFO and duplicate reads do not refresh it', () => {
  const ids = new Deduplicator(2);
  assert.equal(ids.remember('a'), true);
  assert.equal(ids.remember('b'), true);
  assert.equal(ids.remember('a'), false);
  ids.remember('c');
  assert.equal(ids.seen('a'), false);
  assert.equal(ids.seen('b'), true);
  assert.equal(ids.size, 2);
  assert.throws(() => ids.remember(' '));
  assert.throws(() => new Deduplicator(0));
  ids.clear();
  assert.equal(ids.size, 0);
});
test('two motion slots preserve oldest timestamp, sum zoom and respect flush interval', () => {
  const b = new CommandRateLimiter();
  b.push(rotate('initial', 0), 'mouse', 0);
  b.flush(0);
  const zoom = (id, at) => ({
    schemaVersion: 1,
    id,
    at,
    type: 'ZOOM',
    delta: 0.01,
    dt: 0.02,
    traceId: 'zoom',
  });
  b.push(zoom('z1', 1), 'mouse', 1);
  b.push(rotate('r', 2), 'mouse', 2);
  b.push(zoom('z2', 3), 'mouse', 3);
  assert.equal(b.getMetrics().pending, 2);
  assert.deepEqual(b.flush(16), []);
  const output = b.flush(17);
  assert.equal(output.length, 2);
  assert.ok(output.every(isGlobeCommand));
  const z = output.find((c) => c.type === 'ZOOM');
  assert.equal(z.at, 1);
  assert.equal(z.delta, 0.02);
  assert.equal(z.dt, 0.04);
  assert.equal(b.getMetrics().pending, 0);
});
