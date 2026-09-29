import { defaults } from '../config/index.ts';
import type { AppConfig } from '../config/index.ts';
import { distance } from '../shared/index.ts';
import type { NormalizedPoint, Point2 } from '../shared/index.ts';
import type { HandFeatures } from './features/extractFeatures.ts';

export function ema(
  previous: number | undefined,
  sample: number,
  alpha: number,
): number | undefined {
  if (
    !Number.isFinite(sample) ||
    !Number.isFinite(alpha) ||
    alpha <= 0 ||
    alpha > 1 ||
    (previous !== undefined && !Number.isFinite(previous))
  )
    return undefined;
  // Weighted addition avoids overflow of (sample - previous) for opposite extremes.
  return previous === undefined
    ? sample
    : (1 - alpha) * previous + alpha * sample;
}
export function applyDeadzone(
  value: number,
  threshold: number,
): number | undefined {
  if (!Number.isFinite(value) || !Number.isFinite(threshold) || threshold < 0)
    return undefined;
  return Math.abs(value) <= threshold ? 0 : value;
}
export interface TemporalInput {
  sessionId: string;
  frameId: number;
  captureTimeMs: number;
  resultTimeMs: number;
  handId: string | undefined;
  features: HandFeatures | undefined;
}
export type AnchorResetReason =
  'FIRST' | 'HAND_CHANGED' | 'GAP' | 'OUTLIER' | 'NONE';
export interface FilteredHand {
  readonly handId: string;
  readonly atMs: number;
  readonly palm: NormalizedPoint;
  readonly pointer: NormalizedPoint;
  readonly pinchRatio: number;
  readonly delta: Point2;
  readonly rawDelta: Point2;
  readonly dtSeconds: number;
  readonly canMove: boolean;
  readonly resetReason: AnchorResetReason;
}
interface Previous {
  handId: string;
  atMs: number;
  rawPalm: NormalizedPoint;
  palm: NormalizedPoint;
  pointer: NormalizedPoint;
  ratio: number;
}
const finitePoint = (p: NormalizedPoint) =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const blend = (
  a: NormalizedPoint,
  b: NormalizedPoint,
  alpha: number,
): NormalizedPoint => ({
  x: ema(a.x, b.x, alpha)!,
  y: ema(a.y, b.y, alpha)!,
  z: ema(a.z, b.z, alpha)!,
});

/** Bounded pure temporal state: one anchor, no frame/landmark history and no wall-clock dependency. */
export class TemporalFilter {
  private session: string | undefined;
  private lastFrame = -1;
  private lastTime = -Infinity;
  private previous: Previous | undefined;
  private counters = {
    accepted: 0,
    invalid: 0,
    stale: 0,
    order: 0,
    noHand: 0,
    resets: 0,
    outlier: 0,
  };
  constructor(private readonly config: Readonly<AppConfig> = defaults) {}
  reset(): void {
    this.session = undefined;
    this.lastFrame = -1;
    this.lastTime = -Infinity;
    this.previous = undefined;
  }
  getMetrics() {
    return Object.freeze({ ...this.counters, hasAnchor: !!this.previous });
  }
  update(input: TemporalInput): FilteredHand | undefined {
    if (
      !input ||
      typeof input.sessionId !== 'string' ||
      !input.sessionId ||
      !Number.isSafeInteger(input.frameId) ||
      input.frameId < 0 ||
      !Number.isFinite(input.captureTimeMs) ||
      input.captureTimeMs < 0 ||
      !Number.isFinite(input.resultTimeMs) ||
      input.resultTimeMs < input.captureTimeMs
    ) {
      this.counters.invalid++;
      this.previous = undefined;
      return undefined;
    }
    if (input.sessionId !== this.session) {
      this.reset();
      this.session = input.sessionId;
    }
    if (
      input.frameId <= this.lastFrame ||
      input.captureTimeMs <= this.lastTime
    ) {
      this.counters.order++;
      this.previous = undefined;
      return undefined;
    }
    this.lastFrame = input.frameId;
    this.lastTime = input.captureTimeMs;
    if (
      input.resultTimeMs - input.captureTimeMs >
      this.config.vision.staleFrameMs
    ) {
      this.counters.stale++;
      this.previous = undefined;
      return undefined;
    }
    const features = input.features;
    if (!input.handId || !features?.controlEligible) {
      this.counters.noHand++;
      this.previous = undefined;
      return undefined;
    }
    if (
      !finitePoint(features.palm) ||
      !finitePoint(features.pointer) ||
      !Number.isFinite(features.pinchRatio) ||
      features.pinchRatio < 0
    ) {
      this.counters.invalid++;
      this.previous = undefined;
      return undefined;
    }
    const old = this.previous;
    const gap = old ? input.captureTimeMs - old.atMs : 0;
    let reason: AnchorResetReason = 'NONE';
    if (!old) reason = 'FIRST';
    else if (old.handId !== input.handId) reason = 'HAND_CHANGED';
    else if (gap > this.config.gesture.anchorResetGapMs) reason = 'GAP';
    else if (
      distance(old.rawPalm, features.palm)! > this.config.gesture.maxFrameDelta
    ) {
      reason = 'OUTLIER';
      this.counters.outlier++;
    }
    const reset = reason !== 'NONE';
    const palm = reset
      ? { ...features.palm }
      : blend(old!.palm, features.palm, this.config.gesture.emaAlpha);
    const pointer = reset
      ? { ...features.pointer }
      : blend(old!.pointer, features.pointer, this.config.gesture.pointerAlpha);
    const ratio = reset
      ? features.pinchRatio
      : ema(old!.ratio, features.pinchRatio, this.config.gesture.emaAlpha)!;
    const delta = reset
      ? { x: 0, y: 0 }
      : { x: palm.x - old!.palm.x, y: palm.y - old!.palm.y };
    const rawDelta = reset
      ? { x: 0, y: 0 }
      : {
          x: features.palm.x - old!.rawPalm.x,
          y: features.palm.y - old!.rawPalm.y,
        };
    this.previous = {
      handId: input.handId,
      atMs: input.captureTimeMs,
      rawPalm: { ...features.palm },
      palm,
      pointer,
      ratio,
    };
    this.counters.accepted++;
    if (reset) this.counters.resets++;
    return {
      handId: input.handId,
      atMs: input.captureTimeMs,
      palm: { ...palm },
      pointer: { ...pointer },
      pinchRatio: ratio,
      delta,
      rawDelta,
      dtSeconds: reset ? 0 : gap / 1000,
      canMove: !reset,
      resetReason: reason,
    };
  }
}
