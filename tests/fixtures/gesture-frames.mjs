import { syntheticFrame } from './vision-sequences.mjs';
import { palmWidth } from '../../src/shared/index.ts';
// First-party synthetic geometry, never a recording or proof of model recognition.
export function gestureFrame(
  id,
  atMs,
  {
    x = 0.35,
    y = 0.45,
    score = 0.9,
    gesture = 'Open_Palm',
    handedness = 'Right',
    sessionId = 'gesture-fixture',
  } = {},
) {
  const frame = syntheticFrame(id);
  frame.sessionId = sessionId;
  frame.captureTimeMs = atMs;
  frame.resultTimeMs = atMs + 1;
  const hand = frame.hands[0];
  hand.handedness = handedness;
  hand.gestures = [{ name: gesture, score }];
  hand.landmarks = hand.landmarks.map((p) => ({
    ...p,
    x: x + (p.x - 0.4) * 1.5,
    y: y + (p.y - 0.4) * 1.5,
  }));
  return frame;
}

export function pinchFrame(id, atMs, ratio = 0.29, options = {}) {
  const frame = gestureFrame(id, atMs, { gesture: 'None', ...options });
  const hand = frame.hands[0],
    width = palmWidth(hand.landmarks),
    index = hand.landmarks[8];
  hand.landmarks[4] = { x: index.x + width * ratio, y: index.y, z: index.z };
  return frame;
}
