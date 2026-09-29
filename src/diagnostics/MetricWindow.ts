export interface MetricSummary {
  readonly count: number;
  readonly latest: number | null;
  readonly mean: number | null;
  readonly median: number | null;
  readonly p95: number | null;
  readonly min: number | null;
  readonly max: number | null;
}
const valid = (n: number) =>
  Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER;
/** Fixed-capacity time window. Empty observations are unknown, never invented zeroes. */
export class MetricWindow {
  private readonly samples: ({ atMs: number; value: number } | undefined)[];
  private next = 0;
  private count = 0;
  private time = -Infinity;
  constructor(
    readonly capacity: number,
    readonly windowMs: number,
  ) {
    if (
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      !valid(windowMs) ||
      windowMs === 0
    )
      throw new RangeError('Invalid metric window');
    this.samples = new Array(capacity);
  }
  add(value: number, atMs: number): boolean {
    if (!valid(value) || !valid(atMs) || atMs < this.time) return false;
    this.time = atMs;
    this.samples[this.next] = { atMs, value };
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
    return true;
  }
  snapshot(nowMs: number): Readonly<MetricSummary> {
    const values: number[] = [];
    if (valid(nowMs) && nowMs >= this.time) {
      for (let i = 0; i < this.count; i++) {
        const sample =
          this.samples[
            (this.next - this.count + i + this.capacity) % this.capacity
          ]!;
        if (nowMs - sample.atMs <= this.windowMs) values.push(sample.value);
      }
    }
    const count = values.length,
      latest = values.at(-1) ?? null;
    values.sort((a, b) => a - b);
    const mid = Math.floor(count / 2);
    return Object.freeze({
      count,
      latest,
      mean: count
        ? values.reduce((sum, value) => sum + value, 0) / count
        : null,
      median: count
        ? count % 2
          ? values[mid]!
          : (values[mid - 1]! + values[mid]!) / 2
        : null,
      p95: count ? values[Math.ceil(count * 0.95) - 1]! : null,
      min: values[0] ?? null,
      max: values.at(-1) ?? null,
    });
  }
  clear(): void {
    this.samples.fill(undefined);
    this.count = 0;
    this.next = 0;
    this.time = -Infinity;
  }
}
