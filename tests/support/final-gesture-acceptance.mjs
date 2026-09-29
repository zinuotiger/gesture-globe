import {
  createGestureAcceptancePlan,
  summarizeGestureTrials,
} from './gesture-acceptance.mjs';
export function createFinalGesturePlan() {
  const suites = [];
  for (const browser of ['Chrome', 'Edge'])
    for (const versionSlot of ['CURRENT_MAJOR', 'PREVIOUS_MAJOR']) {
      const suite = createGestureAcceptancePlan();
      suite.task = 'TASK-708';
      suite.environment.browser = browser;
      suites.push({ id: `${browser}-${versionSlot}`, versionSlot, ...suite });
    }
  return {
    task: 'TASK-708',
    schemaVersion: 1,
    manual: 'NOT_RUN',
    acceptance: 'ACCEPTANCE_DEFERRED',
    configVersion: suites[0].configVersion,
    configSha256: suites[0].configSha256,
    calibration: 'ENGINEERING_DEFAULTS_NOT_HUMAN_CALIBRATED',
    versionPolicy:
      'Record actual full browser versions at acceptance; current/previous slots are not claims of installed or tested versions.',
    prerequisiteEvidence: [
      'TASK-208',
      'TASK-412',
      'TASK-612',
      'TASK-706',
      'TASK-707',
    ],
    publicRelease: 'BLOCKED_PENDING_LICENSE',
    suites,
  };
}
/** Arithmetic helper only. Records need separately reviewed physical provenance. */
export function summarizeFinalTrials(plan, records) {
  if (!Array.isArray(records) || records.length > 10000)
    throw new TypeError('Expected bounded trial records');
  const grouped = new Map(plan.suites.map((suite) => [suite.id, []]));
  for (const record of records) {
    if (
      !record ||
      !grouped.has(record.suiteId) ||
      record.configVersion !== plan.configVersion ||
      record.configSha256 !== plan.configSha256
    )
      throw new TypeError('Unknown browser suite or mismatched configuration');
    grouped.get(record.suiteId).push(record);
  }
  return {
    manualAcceptance: 'NOT_REVIEWED',
    status: records.length ? 'PARTIAL' : 'NOT_RUN',
    suites: plan.suites.map((suite) => ({
      id: suite.id,
      ...summarizeGestureTrials(grouped.get(suite.id)),
      physicalProvenance: 'REQUIRES_HUMAN_REVIEW',
    })),
  };
}
