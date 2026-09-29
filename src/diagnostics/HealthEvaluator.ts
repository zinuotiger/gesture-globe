export interface HealthOptions {
  lowFps: number;
  recoveredFps: number;
  highInferenceMs: number;
  recoveredInferenceMs: number;
  highLatencyMs: number;
  recoveredLatencyMs: number;
  highDropRatio: number;
  recoveredDropRatio: number;
  triggerMs: number;
  recoverMs: number;
  maxGapMs: number;
}
export interface HealthInput {
  renderFps: number | null;
  inferenceP95: number | null;
  latencyP95: number | null;
  dropRatio: number | null;
  restarts: number;
}
export type HealthAlert =
  | 'LOW_RENDER'
  | 'HIGH_INFERENCE'
  | 'HIGH_LATENCY'
  | 'HIGH_DROPS'
  | 'WORKER_RESTART';
interface Condition {
  active: boolean;
  badSince?: number;
  goodSince?: number;
}
const finite = (n: number | null): n is number =>
  n !== null && Number.isFinite(n) && n >= 0;
/** Hysteresis and dwell use observed elapsed time; absent data never claims recovery. */
export class HealthEvaluator {
  private conditions = new Map<HealthAlert, Condition>();
  private previousAt = -Infinity;
  private restarts = 0;
  constructor(private readonly options: Readonly<HealthOptions>) {
    if (
      Object.values(options).some((n) => !Number.isFinite(n) || n <= 0) ||
      options.lowFps >= options.recoveredFps ||
      options.highInferenceMs <= options.recoveredInferenceMs ||
      options.highLatencyMs <= options.recoveredLatencyMs ||
      options.highDropRatio <= options.recoveredDropRatio ||
      options.highDropRatio > 1
    )
      throw new RangeError('Invalid health thresholds');
  }
  evaluate(input: Readonly<HealthInput>, atMs: number) {
    if (!Number.isFinite(atMs) || atMs < 0 || atMs < this.previousAt)
      return this.snapshot();
    if (atMs - this.previousAt > this.options.maxGapMs)
      for (const state of this.conditions.values()) {
        delete state.badSince;
        delete state.goodSince;
      }
    this.previousAt = atMs;
    const observe = (
      id: HealthAlert,
      value: number | null,
      bad: (n: number) => boolean,
      good: (n: number) => boolean,
    ) => {
      const s = this.conditions.get(id) ?? { active: false };
      this.conditions.set(id, s);
      if (!finite(value)) {
        delete s.badSince;
        delete s.goodSince;
        return;
      }
      if (bad(value)) {
        delete s.goodSince;
        s.badSince ??= atMs;
        if (atMs - s.badSince >= this.options.triggerMs) s.active = true;
      } else if (good(value)) {
        delete s.badSince;
        s.goodSince ??= atMs;
        if (atMs - s.goodSince >= this.options.recoverMs) s.active = false;
      } else {
        delete s.badSince;
        delete s.goodSince;
      }
    };
    const o = this.options;
    observe(
      'LOW_RENDER',
      input.renderFps,
      (n) => n < o.lowFps,
      (n) => n >= o.recoveredFps,
    );
    observe(
      'HIGH_INFERENCE',
      input.inferenceP95,
      (n) => n > o.highInferenceMs,
      (n) => n <= o.recoveredInferenceMs,
    );
    observe(
      'HIGH_LATENCY',
      input.latencyP95,
      (n) => n > o.highLatencyMs,
      (n) => n <= o.recoveredLatencyMs,
    );
    observe(
      'HIGH_DROPS',
      input.dropRatio,
      (n) => n > o.highDropRatio,
      (n) => n <= o.recoveredDropRatio,
    );
    if (Number.isSafeInteger(input.restarts) && input.restarts >= 0) {
      if (input.restarts > this.restarts)
        this.conditions.set('WORKER_RESTART', {
          active: true,
          goodSince: atMs,
        });
      this.restarts = input.restarts;
      const s = this.conditions.get('WORKER_RESTART');
      if (s?.goodSince !== undefined && atMs - s.goodSince >= o.recoverMs)
        s.active = false;
      else if (s?.active && s.goodSince === undefined) s.goodSince = atMs;
    }
    return this.snapshot();
  }
  snapshot() {
    return Object.freeze(
      [...this.conditions]
        .filter(([, state]) => state.active)
        .map(([id]) => id),
    );
  }
  reset() {
    this.conditions.clear();
    this.previousAt = -Infinity;
    this.restarts = 0;
  }
}
