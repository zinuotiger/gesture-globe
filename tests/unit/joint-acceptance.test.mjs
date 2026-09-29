import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'vitest';
import { createJointAcceptancePlan } from '../support/joint-acceptance.mjs';
import { defaults } from '../../src/config/index.ts';
test('final joint plan binds current configuration and never invents physical or external evidence', () => {
  const plan = createJointAcceptancePlan();
  assert.equal(
    plan.configSha256,
    createHash('sha256').update(JSON.stringify(defaults)).digest('hex'),
  );
  assert.ok(
    plan.checks.every(
      (check) => check.status === 'NOT_RUN' && check.evidence === null,
    ),
  );
  assert.ok(Object.values(plan.environment).every((value) => value === null));
  assert.equal(
    plan.gestures.suites.reduce((count, suite) => count + suite.rows.length, 0),
    720,
  );
  assert.ok(
    plan.gestures.suites.every((suite) =>
      suite.rows.every(
        (row) => row.status === 'NOT_RUN' && row.successes === null,
      ),
    ),
  );
  assert.equal(plan.publicRelease, 'BLOCKED_PENDING_LICENSE');
});
