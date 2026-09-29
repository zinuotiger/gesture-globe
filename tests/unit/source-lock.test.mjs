import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SourceLockManager } from '../../src/interaction/index.ts';
import { defaults } from '../../src/config/index.ts';
test('mouse preempts gesture immediately and denies gesture/Agent until exact 800ms expiry', () => {
  const locks = new SourceLockManager();
  assert.equal(locks.tryAcquire('gesture', 0).accepted, true);
  const mouse = locks.tryAcquire('mouse', 40);
  assert.equal(mouse.reason, 'PREEMPTED');
  assert.equal(mouse.preempted, 'gesture');
  assert.equal(mouse.state.expiresAtMs, 840);
  assert.equal(locks.tryAcquire('gesture', 80).reason, 'LOWER_PRIORITY');
  assert.equal(locks.tryAcquire('agent', 839).reason, 'LOWER_PRIORITY');
  assert.equal(locks.current(839).expiresAtMs, 840);
  assert.equal(locks.tryAcquire('gesture', 840).reason, 'ACQUIRED');
});
test('accepted manual activity renews; equal-priority keyboard/UI always take control; Agent is lowest', () => {
  const locks = new SourceLockManager();
  locks.tryAcquire('agent', 0);
  assert.equal(locks.tryAcquire('gesture', 10).preempted, 'agent');
  assert.equal(locks.tryAcquire('keyboard', 20).preempted, 'gesture');
  assert.equal(locks.tryAcquire('keyboard', 100).reason, 'RENEWED');
  assert.equal(locks.current(100).expiresAtMs, 900);
  assert.equal(locks.tryAcquire('ui', 110).preempted, 'keyboard');
  assert.equal(locks.tryAcquire('mouse', 120).preempted, 'ui');
  assert.equal(locks.release('agent', 130), false);
  assert.equal(locks.current(920).owner, null);
  assert.equal(locks.tryAcquire('agent', 920).accepted, true);
});
test('Fist pauses only gesture; manual controls remain live, missing frame refresh expires pause safely', () => {
  const locks = new SourceLockManager();
  locks.tryAcquire('gesture', 0);
  assert.equal(locks.setGesturePaused(true, 40), true);
  assert.equal(locks.current(40).owner, null);
  assert.equal(locks.tryAcquire('gesture', 50).reason, 'GESTURE_PAUSED');
  assert.equal(locks.tryAcquire('ui', 60).accepted, true);
  assert.equal(locks.setGesturePaused(true, 80), true);
  assert.equal(locks.current(80).owner, 'ui');
  assert.equal(locks.current(259).gesturePaused, true);
  assert.equal(locks.current(260).gesturePaused, false);
  assert.equal(locks.tryAcquire('gesture', 260).reason, 'LOWER_PRIORITY');
  locks.release('ui', 260);
  assert.equal(locks.tryAcquire('gesture', 260).accepted, true);
  locks.setGesturePaused(true, 270);
  locks.setGesturePaused(false, 280);
  assert.equal(locks.tryAcquire('gesture', 280).accepted, true);
});
test('finite leases, bad clocks/sources, immutable snapshots and safety cancellation cannot leave stuck ownership', () => {
  const locks = new SourceLockManager();
  locks.tryAcquire('mouse', 100);
  for (const at of [NaN, Infinity, -1, 99, Number.MAX_VALUE])
    assert.equal(locks.tryAcquire('gesture', at).reason, 'INVALID_TIME');
  assert.equal(locks.tryAcquire('__proto__', 101).reason, 'INVALID_SOURCE');
  assert.equal(locks.current(101).expiresAtMs, 900);
  assert.throws(() => locks.current(100));
  assert.throws(() => {
    locks.current(101).owner = 'agent';
  });
  assert.equal(locks.setGesturePaused(true, NaN), false);
  locks.cancelAll();
  assert.equal(locks.current(101).owner, null);
  assert.equal(locks.tryAcquire('gesture', 102).accepted, true);
  assert.equal(locks.current(282).owner, null);
  assert.throws(
    () =>
      new SourceLockManager({
        ...defaults,
        interaction: { ...defaults.interaction, mouseLockMs: 0 },
      }),
  );
});
