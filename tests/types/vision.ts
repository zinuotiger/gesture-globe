import type { VisionRequest, VisionResponse } from '../../src/vision/index.ts';
const request: VisionRequest = {
  type: 'RESUME',
  schemaVersion: 1,
  sessionId: 'typed',
};
// @ts-expect-error unknown schema versions must not compile
const unknownVersion: VisionRequest = { ...request, schemaVersion: 2 };
// @ts-expect-error bitmap/frame metadata mandatory
const missingFrame: VisionRequest = {
  type: 'PROCESS_FRAME',
  schemaVersion: 1,
  sessionId: 'typed',
};
// @ts-expect-error READY requires model version
const missingVersion: VisionResponse = {
  type: 'READY',
  schemaVersion: 1,
  sessionId: 'typed',
};
void [request, unknownVersion, missingFrame, missingVersion];
