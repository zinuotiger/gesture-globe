import type { AppConfig, QualityLevel } from '../config/index.ts';
import type { HealthAlert } from '../diagnostics/index.ts';
export interface PerformanceObservation {
  atMs: number;
  visible: boolean;
  inferenceActive: boolean;
  renderFps: number | null;
  inferenceP95: number | null;
  latencyP95: number | null;
  alerts: readonly HealthAlert[];
}
const levels = ['HIGH', 'MEDIUM', 'LOW'] as const;
const finite = (n: number | null): n is number =>
  n !== null && Number.isFinite(n) && n >= 0;
/** Measured policy only; never starts media, inference or a new recognition session. */
export class PerformanceGovernor {
  private pressure = 0;
  private previousAt = -Infinity;
  private changedAt = -Infinity;
  private goodSince: number | undefined;
  constructor(private readonly config: Readonly<AppConfig>) {}
  observe(value: Readonly<PerformanceObservation>) {
    const { atMs } = value;
    if (!Number.isFinite(atMs) || atMs < 0 || atMs < this.previousAt)
      return this.snapshot();
    if (atMs - this.previousAt > this.config.diagnostics.health.maxGapMs)
      this.goodSince = undefined;
    this.previousAt = atMs;
    if (!value.visible) {
      this.goodSince = undefined;
      return this.snapshot();
    }
    const h = this.config.diagnostics.health;
    const bad =
      (value.alerts.includes('LOW_RENDER') &&
        finite(value.renderFps) &&
        value.renderFps < h.lowFps) ||
      (value.inferenceActive &&
        value.alerts.includes('HIGH_INFERENCE') &&
        finite(value.inferenceP95) &&
        value.inferenceP95 > h.highInferenceMs) ||
      (value.inferenceActive &&
        value.alerts.includes('HIGH_LATENCY') &&
        finite(value.latencyP95) &&
        value.latencyP95 > h.highLatencyMs);
    if (bad) {
      this.goodSince = undefined;
      if (
        this.pressure < 2 &&
        atMs - this.changedAt >= this.config.diagnostics.adaptive.stepCooldownMs
      ) {
        this.pressure++;
        this.changedAt = atMs;
      }
    } else {
      const healthy =
        finite(value.renderFps) &&
        value.renderFps >= h.recoveredFps &&
        (!value.inferenceActive ||
          (finite(value.inferenceP95) &&
            value.inferenceP95 <= h.recoveredInferenceMs &&
            (value.latencyP95 === null ||
              (finite(value.latencyP95) &&
                value.latencyP95 <= h.recoveredLatencyMs)))) &&
        !value.alerts.some((a) =>
          ['LOW_RENDER', 'HIGH_INFERENCE', 'HIGH_LATENCY'].includes(a),
        );
      if (!healthy) this.goodSince = undefined;
      else {
        this.goodSince ??= atMs;
        if (
          this.pressure > 0 &&
          atMs - this.goodSince >=
            this.config.diagnostics.adaptive.recoveryHoldMs &&
          atMs - this.changedAt >=
            this.config.diagnostics.adaptive.stepCooldownMs
        ) {
          this.pressure--;
          this.changedAt = atMs;
          this.goodSince = atMs;
        }
      }
    }
    return this.snapshot();
  }
  snapshot() {
    const base = levels.indexOf(this.config.quality.autoInitial);
    const autoQuality: Exclude<QualityLevel, 'AUTO'> =
      levels[Math.min(2, base + this.pressure)]!;
    const maximum = Math.floor(this.config.vision.targetHz),
      minimum = Math.ceil(this.config.vision.minHz);
    const requested =
      this.pressure === 0
        ? this.config.vision.targetHz
        : this.pressure === 1
          ? this.config.diagnostics.adaptive.middleHz
          : minimum;
    // The scheduler's runtime setter accepts integer rates. An empty integer interval
    // retains the configured startup rate rather than crossing its bounds.
    const targetHz =
      this.pressure === 0 || minimum > maximum
        ? this.config.vision.targetHz
        : Math.max(minimum, Math.min(maximum, Math.floor(requested)));
    return Object.freeze({ pressure: this.pressure, autoQuality, targetHz });
  }
}
