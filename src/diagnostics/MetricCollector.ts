import { isPlainDto } from '../shared/index.ts';
import { MetricWindow } from './MetricWindow.ts';

export interface DropCounters {
  submitted: number;
  busy: number;
  stale: number;
  rate: number;
  unavailable: number;
}
const emptyDrops = (): Readonly<DropCounters> =>
  Object.freeze({ submitted: 0, busy: 0, stale: 0, rate: 0, unavailable: 0 });
/** Scalar-only observation sink. Invalid samples cannot break the rendering loop. */
export class MetricCollector {
  private readonly renderTimes: MetricWindow;
  private readonly inferenceTimes: MetricWindow;
  private readonly inferenceIntervals: MetricWindow;
  private previousRender: number | undefined;
  private previousInference: number | undefined;
  private drops = emptyDrops();
  private disposed = false;
  constructor(options: Readonly<{ capacity: number; windowMs: number }>) {
    const { capacity: metricCapacity, windowMs: metricWindowMs } = options;
    this.renderTimes = new MetricWindow(metricCapacity, metricWindowMs);
    this.inferenceTimes = new MetricWindow(metricCapacity, metricWindowMs);
    this.inferenceIntervals = new MetricWindow(metricCapacity, metricWindowMs);
  }
  recordRender(atMs: number): boolean {
    if (this.disposed || !this.validTime(atMs, this.previousRender))
      return false;
    if (this.previousRender !== undefined && atMs > this.previousRender)
      this.renderTimes.add(atMs - this.previousRender, atMs);
    this.previousRender = atMs;
    return true;
  }
  recordInference(atMs: number, inferenceMs: number): boolean {
    if (
      this.disposed ||
      !this.validTime(atMs, this.previousInference) ||
      !this.inferenceTimes.add(inferenceMs, atMs)
    )
      return false;
    if (this.previousInference !== undefined && atMs > this.previousInference)
      this.inferenceIntervals.add(atMs - this.previousInference, atMs);
    this.previousInference = atMs;
    return true;
  }
  private validTime(atMs: number, previous?: number) {
    return (
      Number.isFinite(atMs) &&
      atMs >= 0 &&
      atMs <= Number.MAX_SAFE_INTEGER &&
      (previous === undefined || atMs > previous)
    );
  }
  updateDrops(value: Readonly<DropCounters>): boolean {
    if (
      this.disposed ||
      !value ||
      !isPlainDto(value) ||
      Object.keys(this.drops).some(
        (key) =>
          !Number.isSafeInteger(value[key as keyof DropCounters]) ||
          value[key as keyof DropCounters] < 0,
      )
    )
      return false;
    // Copy only known numeric counters; no payload or model object is retained.
    this.drops = Object.freeze({
      submitted: value.submitted,
      busy: value.busy,
      stale: value.stale,
      rate: value.rate,
      unavailable: value.unavailable,
    });
    return true;
  }
  pauseRender() {
    this.previousRender = undefined;
    this.renderTimes.clear();
  }
  pauseInference() {
    this.previousInference = undefined;
    this.inferenceTimes.clear();
    this.inferenceIntervals.clear();
  }
  snapshot(nowMs: number) {
    const render = this.renderTimes.snapshot(nowMs),
      inference = this.inferenceTimes.snapshot(nowMs),
      intervals = this.inferenceIntervals.snapshot(nowMs);
    return Object.freeze({
      schemaVersion: 1 as const,
      render,
      inference,
      renderFps:
        render.mean !== null && render.mean > 0 ? 1000 / render.mean : null,
      inferenceFps:
        intervals.mean !== null && intervals.mean > 0
          ? 1000 / intervals.mean
          : null,
      drops: this.drops,
    });
  }
  dispose() {
    this.disposed = true;
    this.pauseRender();
    this.pauseInference();
    this.drops = emptyDrops();
  }
}
