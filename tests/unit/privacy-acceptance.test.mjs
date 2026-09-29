import { test, expect } from 'vitest';
import { createPrivacyAcceptancePlan } from '../support/privacy-acceptance.mjs';
import { defaults } from '../../src/config/index.ts';
test('privacy plan distinguishes automatic preparation from unperformed physical acceptance', () => {
  const p = createPrivacyAcceptancePlan();
  expect(p.manual).toBe('NOT_RUN');
  expect(p.acceptance).toBe('ACCEPTANCE_DEFERRED');
  expect(p.configVersion).toBe(defaults.configVersion);
  expect(p.configSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(p.environments.map((e) => e.browser)).toEqual(['Chrome', 'Edge']);
  for (const e of p.environments) {
    expect(e.status).toBe('NOT_RUN');
    expect(e.browserVersion).toBeNull();
    expect(e.checks).toHaveLength(11);
    expect(
      e.checks.every(
        (c) =>
          c.status === 'NOT_RUN' && c.actual === null && c.evidence === null,
      ),
    ).toBe(true);
  }
});
test('new plans cannot inherit a fabricated result or share mutable check records', () => {
  const p = createPrivacyAcceptancePlan();
  p.environments[0].checks[0].status = 'PASS';
  expect(p.environments[1].checks[0].status).toBe('NOT_RUN');
  expect(createPrivacyAcceptancePlan().environments[0].checks[0].status).toBe(
    'NOT_RUN',
  );
  expect(Object.keys(p.environments[0])).not.toContain('deviceId');
});
