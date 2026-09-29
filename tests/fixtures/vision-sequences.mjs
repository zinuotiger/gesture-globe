// FIRST_PARTY / synthetic numeric fixtures authored for deterministic tests.
// No captured video, human landmarks or downloaded data is represented here.
export function syntheticFrame(frameId = 0) {
  return {
    schemaVersion: 1,
    sessionId: 'synthetic-fixture',
    frameId,
    captureTimeMs: frameId * 50,
    resultTimeMs: frameId * 50 + 10,
    inferenceMs: 10,
    source: { width: 640, height: 480 },
    hands: [
      {
        localId: 'synthetic-slot-0',
        handedness: 'Right',
        handednessScore: 0.95,
        landmarks: Array.from({ length: 21 }, (_, i) => ({
          x: 0.3 + (i % 5) * 0.05,
          y: 0.3 + Math.floor(i / 5) * 0.05,
          z: 0,
        })),
        gestures: [{ name: 'Open_Palm', score: 0.9 }],
        bbox: { x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
      },
    ],
  };
}
export const visionSequence = (count = 3) => ({
  schemaVersion: 1,
  fixtureId: 'synthetic-open-palm-grid-v1',
  source: 'synthetic',
  frames: Array.from({ length: count }, (_, i) => syntheticFrame(i)),
});
