import { createHash } from 'node:crypto';
import { defaults } from '../../src/config/defaults.ts';
export function createPrivacyAcceptancePlan() {
  return {
    schemaVersion: 1,
    task: 'TASK-706',
    engineering: 'AUTOMATIC_PREPARATION',
    manual: 'NOT_RUN',
    configVersion: defaults.configVersion,
    configSha256: createHash('sha256')
      .update(JSON.stringify(defaults))
      .digest('hex'),
    publicRelease: 'BLOCKED_PENDING_LICENSE',
    evidencePolicy:
      'Scalar counts, redacted request metadata and typed observations only; no frames, landmark streams, raw HAR bodies or heap dumps.',
    environments: ['Chrome', 'Edge'].map((browser) => ({
      browser,
      browserVersion: null,
      os: null,
      machineModel: null,
      cameraModel: null,
      cameraResolution: null,
      quality: null,
      observedAt: null,
      anonymousTester: null,
      status: 'NOT_RUN',
      checks: [
        'NO_STARTUP_PERMISSION',
        'AUDIO_FALSE',
        'DENIAL_MANUAL_FALLBACK',
        'ALLOW_REAL_LOCAL_MODEL',
        'NO_FRAME_UPLOAD',
        'STORAGE_WHITELIST',
        'PREVIEW_HIDE_RETAINS_INDICATOR',
        'CLOSE_TRACKS_ENDED',
        'CLOSE_INDICATOR_OFF',
        'TEN_CYCLES_SINGLE_STREAM_WORKER',
        'PAGEHIDE_RELEASE',
      ].map((id) => ({ id, status: 'NOT_RUN', actual: null, evidence: null })),
    })),
    acceptance: 'ACCEPTANCE_DEFERRED',
  };
}
