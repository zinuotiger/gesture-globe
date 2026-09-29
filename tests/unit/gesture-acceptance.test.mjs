import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  createGestureAcceptancePlan,
  summarizeGestureTrials,
  gestures,
} from '../support/gesture-acceptance.mjs';
test('manual matrix covers all dimensions without fabricated samples or calibration', () => {
  const plan = createGestureAcceptancePlan();
  assert.equal(plan.rows.length, 180);
  assert.equal(
    new Set(
      plan.rows.map((r) =>
        [r.gesture, r.hand, r.distanceM, r.lighting, r.background].join('|'),
      ),
    ).size,
    180,
  );
  for (const gesture of gestures)
    assert.equal(plan.rows.filter((r) => r.gesture === gesture).length, 36);
  assert.ok(
    plan.rows.every(
      (r) => r.status === 'NOT_RUN' && r.attempts === 0 && r.successes === null,
    ),
  );
  assert.ok(plan.protocols.every((r) => r.status === 'NOT_RUN'));
  assert.equal(plan.minimumStartsPerGesture, 20);
  assert.equal(plan.acceptance, 'ACCEPTANCE_DEFERRED');
  assert.match(plan.configSha256, /^[a-f0-9]{64}$/);
  assert.ok(Object.values(plan.environment).every((v) => v === null));
  plan.config.point.enterScore = 0;
  assert.equal(createGestureAcceptancePlan().config.point.enterScore, 0.72);
});
test('trial arithmetic distinguishes unrun from zero success and never awards manual PASS', () => {
  const empty = summarizeGestureTrials([]);
  assert.equal(empty.status, 'NOT_RUN');
  assert.equal(empty.summary.Pinch.rate, null);
  const trial = {
    gesture: 'Pinch',
    hand: 'Left',
    success: false,
    entryMs: 1500,
    exitMs: 120,
  };
  assert.equal(summarizeGestureTrials([trial]).summary.Pinch.rate, 0);
  const result = summarizeGestureTrials([trial, { ...trial, success: true }]);
  assert.equal(result.summary.Pinch.rate, 0.5);
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.requiresHumanEvidence, true);
  for (const patch of [
    { success: null },
    { hand: 'Unknown' },
    { entryMs: NaN },
    { exitMs: -1 },
    { gesture: 'other' },
  ])
    assert.throws(() => summarizeGestureTrials([{ ...trial, ...patch }]));
});
