import { test, expect } from 'vitest';
import {
  createFinalGesturePlan,
  summarizeFinalTrials,
} from '../support/final-gesture-acceptance.mjs';
import { defaults } from '../../src/config/index.ts';
test('four browser/version slots bind current configuration without fabricated device acceptance', () => {
  const p = createFinalGesturePlan();
  expect(p.suites.map((s) => s.id)).toEqual([
    'Chrome-CURRENT_MAJOR',
    'Chrome-PREVIOUS_MAJOR',
    'Edge-CURRENT_MAJOR',
    'Edge-PREVIOUS_MAJOR',
  ]);
  expect(p.configVersion).toBe(defaults.configVersion);
  expect(p.configSha256).toMatch(/^[a-f0-9]{64}$/);
  for (const s of p.suites) {
    expect(s.task).toBe('TASK-708');
    expect(s.environment.browserVersion).toBeNull();
    expect(s.rows).toHaveLength(180);
    expect(s.minimumStartsPerGesture).toBe(20);
    expect(
      s.rows.every(
        (r) =>
          r.status === 'NOT_RUN' && r.successes === null && r.attempts === 0,
      ),
    ).toBe(true);
    expect(s.configSha256).toBe(p.configSha256);
  }
  p.suites[0].rows[0].status = 'PASS';
  expect(p.suites[1].rows[0].status).toBe('NOT_RUN');
  expect(createFinalGesturePlan().suites[0].rows[0].status).toBe('NOT_RUN');
});
test('arithmetic preserves failures and never turns synthetic numbers into human PASS', () => {
  const plan = createFinalGesturePlan();
  const trial = {
    suiteId: plan.suites[0].id,
    configVersion: plan.configVersion,
    configSha256: plan.configSha256,
    gesture: 'Open_Palm',
    hand: 'Left',
    success: true,
    entryMs: 200,
    exitMs: 100,
  };
  const report = summarizeFinalTrials(plan, [
    trial,
    { ...trial, success: false },
  ]);
  expect(report.status).toBe('PARTIAL');
  expect(report.manualAcceptance).toBe('NOT_REVIEWED');
  expect(report.suites[0].summary.Open_Palm.rate).toBe(0.5);
  expect(report.suites[1].summary.Open_Palm.rate).toBeNull();
  expect(summarizeFinalTrials(plan, []).status).toBe('NOT_RUN');
  for (const change of [
    { configSha256: 'old' },
    { configVersion: 'old' },
    { suiteId: 'Unknown' },
    { success: null },
    { entryMs: -1 },
  ])
    expect(() =>
      summarizeFinalTrials(plan, [{ ...trial, ...change }]),
    ).toThrow();
});
