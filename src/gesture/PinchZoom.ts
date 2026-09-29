import { defaults } from '../config/index.ts';
import type { AppConfig } from '../config/index.ts';
import type { HandFeatures } from './features/extractFeatures.ts';
import type { FilteredHand } from './TemporalFilter.ts';

export function pinchConditions(
  ratio: number,
  features: HandFeatures | undefined,
  config: Readonly<AppConfig> = defaults,
) {
  const valid =
    !!features?.controlEligible &&
    features.palmWidth > config.handQuality.geometryEpsilon &&
    Number.isFinite(ratio) &&
    ratio >= 0;
  return {
    enter: valid && ratio <= config.pinch.enterRatio,
    hold: valid && ratio < config.pinch.exitRatio,
  };
}
/** Log-distance delta: the downstream Globe applies exp(delta), not this pure module. */
export function zoomDelta(
  sample: FilteredHand,
  config: Readonly<AppConfig> = defaults,
): number {
  if (
    !sample.canMove ||
    !Number.isFinite(sample.dtSeconds) ||
    sample.dtSeconds <= 0 ||
    !Number.isFinite(sample.delta.y) ||
    !Number.isFinite(sample.rawDelta.y) ||
    sample.rawDelta.y === 0
  )
    return 0;
  const speed = sample.delta.y / sample.dtSeconds;
  if (!Number.isFinite(speed)) return 0;
  const bounded = Math.max(
    -config.zoom.maxSpeed,
    Math.min(config.zoom.maxSpeed, speed),
  );
  return (
    (config.zoom.invert ? -1 : 1) *
    bounded *
    sample.dtSeconds *
    config.zoom.gain
  );
}
