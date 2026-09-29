import type {
  Category,
  GestureRecognizerResult,
} from '@mediapipe/tasks-vision';
import type {
  HandObservation,
  NormalizedPoint,
  VisionFrame,
} from '../shared/index.ts';
import type { FrameMetadata } from './BitmapOwnership.ts';
import type { VisionOptions } from './vision.messages.ts';
import { isVisionFrame } from './vision.messages.ts';

type Recognition = Pick<
  GestureRecognizerResult,
  'landmarks' | 'worldLandmarks' | 'handedness' | 'gestures'
>;
const finite = (n: number) => Number.isFinite(n);
function points(input: readonly NormalizedPoint[]): NormalizedPoint[] {
  if (
    !Array.isArray(input) ||
    input.length !== 21 ||
    input.some((p) => !p || !finite(p.x) || !finite(p.y) || !finite(p.z))
  )
    throw new Error('Expected 21 finite landmarks');
  return input.map(({ x, y, z }) => ({ x, y, z }));
}
function categories(input: readonly Category[]) {
  if (
    !Array.isArray(input) ||
    input.some(
      (c) =>
        !c ||
        typeof c.categoryName !== 'string' ||
        !finite(c.score) ||
        c.score < 0 ||
        c.score > 1,
    )
  )
    throw new Error('Invalid classification');
  return input
    .filter((c) => c.categoryName.length > 0)
    .map((c) => ({ name: c.categoryName, score: c.score }))
    .sort((a, b) => b.score - a.score);
}
/** SDK types stop here. Model coordinates stay unmirrored, including out-of-frame points. */
export function normalizeResult(
  result: Recognition,
  metadata: FrameMetadata,
  resultTimeMs: number,
  inferenceMs: number,
  options: Pick<VisionOptions, 'numHands' | 'worldLandmarks'> = {
    numHands: 1,
    worldLandmarks: false,
  },
): VisionFrame {
  if (
    !result ||
    !Array.isArray(result.landmarks) ||
    result.landmarks.length > options.numHands ||
    !finite(resultTimeMs) ||
    resultTimeMs < metadata.captureTimeMs ||
    !finite(inferenceMs) ||
    inferenceMs < 0
  )
    throw new Error('Invalid recognition result metadata');
  const hands: HandObservation[] = result.landmarks.map((input, index) => {
    const landmarks = points(input);
    const candidates = categories(result.handedness[index] ?? []);
    const best = candidates[0];
    const handedness =
      best?.name === 'Left' || best?.name === 'Right' ? best.name : 'Unknown';
    const xs = landmarks.map((p) => p.x),
      ys = landmarks.map((p) => p.y);
    const x = Math.min(...xs),
      y = Math.min(...ys);
    const world = result.worldLandmarks[index];
    return {
      localId: `${metadata.sessionId}:slot-${index}`,
      handedness,
      handednessScore: handedness === 'Unknown' ? 0 : best!.score,
      landmarks,
      gestures: categories(result.gestures[index] ?? []),
      bbox: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
      ...(options.worldLandmarks && world?.length
        ? { worldLandmarks: points(world) }
        : {}),
    };
  });
  const frame: VisionFrame = {
    ...metadata,
    source: { ...metadata.source },
    resultTimeMs,
    inferenceMs,
    hands,
  };
  if (!isVisionFrame(frame))
    throw new Error('Normalized frame violates DTO contract');
  return frame;
}
