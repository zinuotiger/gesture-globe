import { createHash } from 'node:crypto';
import { defaults } from '../../src/config/defaults.ts';
export const gestures = [
  'Open_Palm',
  'Pinch',
  'Closed_Fist',
  'Pointing_Up',
  'Victory',
];
export function createGestureAcceptancePlan() {
  const rows = [];
  for (const gesture of gestures)
    for (const hand of ['Left', 'Right'])
      for (const distanceM of [0.5, 1, 1.5])
        for (const lighting of ['BRIGHT', 'NORMAL', 'DIM_VISIBLE'])
          for (const background of ['SIMPLE', 'CLUTTERED'])
            rows.push({
              gesture,
              hand,
              distanceM,
              lighting,
              background,
              status: 'NOT_RUN',
              attempts: 0,
              successes: null,
              entryMs: null,
              exitMs: null,
              wrongGesture: null,
              jumped: null,
              retried: null,
              notes: '',
            });
  return {
    task: 'TASK-412',
    schemaVersion: 1,
    status: 'NOT_RUN',
    calibration: 'ENGINEERING_DEFAULTS_NOT_HUMAN_CALIBRATED',
    configVersion: defaults.configVersion,
    configSha256: createHash('sha256')
      .update(JSON.stringify(defaults))
      .digest('hex'),
    config: JSON.parse(JSON.stringify(defaults)),
    environment: {
      anonymousTester: null,
      observedAt: null,
      machineModel: null,
      os: null,
      browser: null,
      browserVersion: null,
      cameraModel: null,
      cameraResolution: null,
      quality: null,
    },
    sampling:
      'Sample combinations to cover every dimension; at least 20 independent starts per gesture in total, not 20 in every row.',
    minimumStartsPerGesture: 20,
    targets: {
      Open_Palm: 0.9,
      Pinch: 0.9,
      Closed_Fist: null,
      Pointing_Up: 0.85,
      Victory: 0.85,
    },
    protocols: [
      { id: 'NO_HAND_120S', status: 'NOT_RUN', expected: 'zero GlobeCommands' },
      {
        id: 'STATIONARY_60S',
        status: 'NOT_RUN',
        expected: 'at most one obvious unintended rotate/zoom action',
      },
      {
        id: 'WAVE_60S',
        status: 'NOT_RUN',
        expected: 'zero RESET or SELECT triggers',
      },
      {
        id: 'VICTORY_HOLD_2S',
        status: 'NOT_RUN',
        expected: 'exactly one reset per independently armed hold',
      },
      {
        id: 'POINT_SWEEP_20',
        status: 'NOT_RUN',
        expected: 'zero accidental selections',
      },
      {
        id: 'POINT_DWELL_20',
        status: 'NOT_RUN',
        expected: 'record successful stable dwell selections',
      },
    ],
    rows,
    acceptance: 'ACCEPTANCE_DEFERRED',
    publicRelease: 'BLOCKED_PENDING_LICENSE',
  };
}
export function summarizeGestureTrials(trials) {
  if (!Array.isArray(trials)) throw new TypeError('Expected trial array');
  const summary = Object.fromEntries(
    gestures.map((gesture) => [
      gesture,
      { attempts: 0, successes: 0, rate: null, entryMs: [], exitMs: [] },
    ]),
  );
  for (const trial of trials) {
    if (
      !trial ||
      !gestures.includes(trial.gesture) ||
      typeof trial.success !== 'boolean' ||
      !['Left', 'Right'].includes(trial.hand) ||
      ![trial.entryMs, trial.exitMs].every((n) => Number.isFinite(n) && n >= 0)
    )
      throw new TypeError(
        'Incomplete or invalid trial; never count missing data as success',
      );
    const row = summary[trial.gesture];
    row.attempts++;
    row.successes += Number(trial.success);
    row.rate = row.successes / row.attempts;
    row.entryMs.push(trial.entryMs);
    row.exitMs.push(trial.exitMs);
  }
  // Arithmetic assistance only: source authenticity and device acceptance are never inferred here.
  return {
    status: trials.length ? 'PARTIAL' : 'NOT_RUN',
    requiresHumanEvidence: true,
    summary,
  };
}
