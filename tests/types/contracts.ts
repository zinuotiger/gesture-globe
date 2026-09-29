import type {
  VisionFrame,
  GestureIntent,
  EventEnvelope,
  AppError,
  Result,
  GlobeCommand,
} from '../../src/shared/index.ts';

export const frame: VisionFrame = {
  schemaVersion: 1,
  sessionId: 's',
  frameId: 1,
  captureTimeMs: 0,
  resultTimeMs: 1,
  inferenceMs: 1,
  source: { width: 1280, height: 720 },
  hands: [],
};
// @ts-expect-error Unknown protocol versions must be rejected at compile time.
export const badFrame: VisionFrame = { ...frame, schemaVersion: 2 };
export const event: EventEnvelope<'READY', { ready: boolean }> = {
  schemaVersion: 1,
  eventId: 'e',
  type: 'READY',
  atMs: 0,
  source: 'M01',
  payload: { ready: true },
};
// @ts-expect-error UI cannot masquerade as a Gesture source.
export const badSource: GestureIntent['source'] = 'ui';
// @ts-expect-error Unknown application modules are not allowed.
export const badModule: AppError['module'] = 'camera';
// @ts-expect-error Continuous commands must carry time delta.
export const missingDt: GlobeCommand = {
  schemaVersion: 1,
  id: 'c',
  at: 0,
  type: 'ROTATE',
  yaw: 1,
  pitch: 0,
};
export function unwrap(result: Result<number>): number | string {
  return result.ok ? result.value : result.error.code;
}
