export interface StabilityObservation {
  visible: boolean;
  heapBytes: number | null;
  renderFps: number | null;
  inferenceP95: number | null;
  latencyMax: number | null;
  inFlight: number | null;
  busyDrops: number | null;
  errors: number;
}
const durationMs = 1_200_000;
const intervalMs = 1000;
const scalar = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
/** Test instrumentation only: bounded scalar observations, never an acceptance signer. */
export class StabilityRecorder {
  private samples: (StabilityObservation & { elapsedMs: number })[] = [];
  private start: number | null = null;
  private previous: number | null = null;
  private running = true;
  private hidden = false;
  private gap = false;
  get active(): boolean {
    return this.running;
  }
  observe(atMs: number, input: StabilityObservation): boolean {
    if (!this.running || scalar(atMs) === null) return false;
    if (this.previous !== null && atMs <= this.previous) return false;
    if (!input.visible) this.hidden = true;
    if (this.previous !== null && atMs - this.previous < intervalMs)
      return false;
    if (this.start === null) this.start = atMs;
    if (this.previous !== null && atMs - this.previous > 2500) this.gap = true;
    this.previous = atMs;
    this.samples.push({
      elapsedMs: atMs - this.start,
      visible: input.visible === true,
      heapBytes: scalar(input.heapBytes),
      renderFps: scalar(input.renderFps),
      inferenceP95: scalar(input.inferenceP95),
      latencyMax: scalar(input.latencyMax),
      inFlight: scalar(input.inFlight),
      busyDrops: scalar(input.busyDrops),
      errors: scalar(input.errors) ?? 0,
    });
    if (atMs - this.start >= durationMs || this.samples.length >= 1201)
      this.running = false;
    return true;
  }
  stop() {
    this.running = false;
  }
  snapshot() {
    const samples = this.samples.map((s) => ({ ...s }));
    const elapsedMs = samples.at(-1)?.elapsedMs ?? 0;
    const first = samples[0]?.heapBytes;
    const last = samples.at(-1)?.heapBytes;
    return {
      schemaVersion: 1,
      kind: 'OBSERVED_SCALAR_SERIES',
      acceptance: 'NOT_REVIEWED',
      requiredDurationMs: durationMs,
      elapsedMs,
      running: this.running,
      collection:
        elapsedMs >= durationMs && !this.hidden && !this.gap
          ? 'READY_FOR_REVIEW'
          : 'INCOMPLETE',
      hiddenObserved: this.hidden,
      samplingGapObserved: this.gap,
      queueViolation: samples.some(
        (s) => s.inFlight !== null && s.inFlight > 1,
      ),
      latencyOverOneSecond: samples.some(
        (s) => s.latencyMax !== null && s.latencyMax > 1000,
      ),
      heapDeltaBytes:
        typeof first === 'number' && typeof last === 'number'
          ? last - first
          : null,
      memoryScope:
        'Main-thread performance.memory only when supported; Worker, GPU and native memory unknown. Delta is not a leak verdict.',
      samples,
    };
  }
}
