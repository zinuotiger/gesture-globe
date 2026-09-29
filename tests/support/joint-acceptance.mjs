import { createFinalGesturePlan } from './final-gesture-acceptance.mjs';
export function createJointAcceptancePlan() {
  const gestures = createFinalGesturePlan();
  return {
    task: 'TASK-806',
    schemaVersion: 1,
    manual: 'NOT_RUN',
    acceptance: 'ACCEPTANCE_DEFERRED',
    configVersion: gestures.configVersion,
    configSha256: gestures.configSha256,
    calibration: 'ENGINEERING_DEFAULTS_NOT_HUMAN_CALIBRATED',
    publicRelease: 'BLOCKED_PENDING_LICENSE',
    physicalTasks: [
      'TASK-208',
      'TASK-306',
      'TASK-412',
      'TASK-508',
      'TASK-612',
      'TASK-706',
      'TASK-707',
      'TASK-708',
      'TASK-710',
      'TASK-806',
    ],
    externalTasks: ['TASK-804', 'TASK-805', 'TASK-806'],
    environment: {
      anonymousTester: null,
      machine: null,
      os: null,
      gpu: null,
      cameraModel: null,
      actualResolution: null,
      browserFullVersion: null,
      displayScale: null,
      observedAt: null,
    },
    checks: [
      'permission-allow-deny',
      'camera-ten-cycles-indicator',
      'left-right-five-gestures',
      'privacy-network-storage',
      'real-fps-latency-memory',
      'twenty-minute-normal-and-slow-inference',
      'desktop-keyboard-visual',
      'agent-progress-cancel-undo-confirmation',
      'external-provider-integration',
      'evidence-package-demo',
    ].map((id) => ({ id, status: 'NOT_RUN', evidence: null })),
    gestures,
    instructions:
      'docs/consolidated-acceptance.md; use a separate observation record, never overwrite pinned historical evidence or auto-fill missing results.',
  };
}
