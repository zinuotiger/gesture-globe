import { defaults } from '../../config/index.ts';
import type { AppConfig } from '../../config/index.ts';
import {
  validLandmarks,
  palmCenter,
  palmWidth,
  bbox,
  pinchRatio,
  velocity,
} from '../../shared/index.ts';
import type {
  HandObservation,
  NormalizedPoint,
  Bounds2,
  Point2,
} from '../../shared/index.ts';

export interface HandFeatures {
  readonly palm: NormalizedPoint;
  readonly palmWidth: number;
  readonly pinchRatio: number;
  readonly pointer: NormalizedPoint;
  readonly bbox: Bounds2;
  readonly bboxArea: number;
  readonly completeness: number;
  readonly velocity: (Point2 & { readonly speed: number }) | undefined;
  readonly controlEligible: boolean;
  readonly reason:
    'READY' | 'OUT_OF_FRAME' | 'PALM_TOO_SMALL' | 'TOO_FAR' | 'TOO_CLOSE';
}
export interface FeatureSample {
  readonly palm: NormalizedPoint;
  readonly atMs: number;
}

/** Pure extraction; no gesture classification, tracking, DOM or camera objects. */
export function extractFeatures(
  hand: HandObservation | null | undefined,
  atMs: number,
  previous?: FeatureSample,
  config: Readonly<AppConfig> = defaults,
): HandFeatures | undefined {
  if (
    !hand ||
    !validLandmarks(hand.landmarks) ||
    !Number.isFinite(atMs) ||
    atMs < 0
  )
    return undefined;
  const points = hand.landmarks;
  const palm = palmCenter(points)!,
    width = palmWidth(points),
    bounds = bbox(points),
    ratio = pinchRatio(points, config.handQuality.geometryEpsilon);
  if (width === undefined || !bounds || ratio === undefined) return undefined;
  const area = bounds.width * bounds.height;
  if (!Number.isFinite(area)) return undefined;
  const border = config.handQuality.borderInset;
  const completeness =
    points.filter(
      (p) =>
        p.x >= border &&
        p.x <= 1 - border &&
        p.y >= border &&
        p.y <= 1 - border,
    ).length / points.length;
  const outside = points.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1);
  const reason = outside
    ? 'OUT_OF_FRAME'
    : width <= config.handQuality.geometryEpsilon
      ? 'PALM_TOO_SMALL'
      : area < config.handQuality.minBboxArea
        ? 'TOO_FAR'
        : area > config.handQuality.maxBboxArea
          ? 'TOO_CLOSE'
          : 'READY';
  return {
    palm,
    palmWidth: width,
    pinchRatio: ratio,
    pointer: { ...points[8]! },
    bbox: bounds,
    bboxArea: area,
    completeness,
    velocity: previous
      ? velocity(previous.palm, palm, atMs - previous.atMs)
      : undefined,
    controlEligible: reason === 'READY',
    reason,
  };
}
