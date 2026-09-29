import { isPlainDto } from '../shared/index.ts';
import { MetricWindow } from './MetricWindow.ts';

export interface IntentTiming {
  kind: 'ROTATE' | 'ZOOM' | 'RESET';
  captureMs: number;
  resultMs: number;
  intentMs: number;
}
interface RenderTiming extends IntentTiming {
  traceId: string;
  commandMs: number;
  renderMs: number;
}
const validId = (value: string) =>
  typeof value === 'string' && /^[A-Za-z0-9:_-]{1,256}$/.test(value);
const time = (value: number) =>
  Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
/** Scalar correlation only. Render submission estimates feedback, not display photons. */
export class LatencyTracer {
  private readonly inputs = new Map<string, IntentTiming>();
  private readonly candidates = new Map<string, IntentTiming>();
  private readonly waiting = new Map<string, Omit<RenderTiming, 'renderMs'>>();
  private readonly windows;
  private last: Readonly<RenderTiming> | null = null;
  private disposed = false;
  private rejected = 0;
  private renderedAt = -Infinity;
  constructor(
    private readonly options: Readonly<{ capacity: number; windowMs: number }>,
  ) {
    const make = () => new MetricWindow(options.capacity, options.windowMs);
    this.windows = {
      captureToResult: make(),
      resultToIntent: make(),
      intentToCommand: make(),
      commandToRender: make(),
      captureToRender: make(),
    };
  }
  private set<T>(map: Map<string, T>, key: string, value: T) {
    map.delete(key);
    map.set(key, value);
    if (map.size > this.options.capacity) map.delete(map.keys().next().value!);
  }
  recordIntent(inputId: string, value: Readonly<IntentTiming>): boolean {
    if (
      this.disposed ||
      !validId(inputId) ||
      !value ||
      !isPlainDto(value) ||
      !['ROTATE', 'ZOOM', 'RESET'].includes(value.kind) ||
      ![value.captureMs, value.resultMs, value.intentMs].every(time) ||
      value.captureMs > value.resultMs ||
      value.resultMs > value.intentMs
    ) {
      this.rejected++;
      return false;
    }
    this.expire(value.intentMs);
    this.set(this.inputs, inputId, {
      kind: value.kind,
      captureMs: value.captureMs,
      resultMs: value.resultMs,
      intentMs: value.intentMs,
    });
    return true;
  }
  associate(inputId: string, traceId: string): boolean {
    const input = this.inputs.get(inputId);
    this.inputs.delete(inputId);
    if (this.disposed || !input || !validId(traceId)) return false;
    // Earliest coalesced input keeps combined motion age conservative.
    if (!this.candidates.has(traceId))
      this.set(this.candidates, traceId, input);
    return true;
  }
  command(traceId: string, commandType: string, atMs: number): boolean {
    if (this.disposed || !time(atMs)) return false;
    this.expire(atMs);
    const pending = this.candidates.get(traceId);
    if (
      !pending ||
      commandType !==
        (pending.kind === 'RESET' ? 'RESET_VIEW' : pending.kind) ||
      atMs < pending.intentMs
    )
      return false;
    this.candidates.delete(traceId);
    if (!this.waiting.has(traceId))
      this.set(this.waiting, traceId, { ...pending, traceId, commandMs: atMs });
    return true;
  }
  rendered(atMs: number): number {
    if (this.disposed || !time(atMs) || atMs < this.renderedAt) return 0;
    this.renderedAt = atMs;
    this.expire(atMs);
    let completed = 0;
    for (const [traceId, sample] of this.waiting) {
      if (atMs < sample.commandMs) continue;
      this.windows.captureToResult.add(
        sample.resultMs - sample.captureMs,
        atMs,
      );
      this.windows.resultToIntent.add(sample.intentMs - sample.resultMs, atMs);
      this.windows.intentToCommand.add(
        sample.commandMs - sample.intentMs,
        atMs,
      );
      this.windows.commandToRender.add(atMs - sample.commandMs, atMs);
      this.windows.captureToRender.add(atMs - sample.captureMs, atMs);
      this.last = Object.freeze({ ...sample, renderMs: atMs });
      this.waiting.delete(traceId);
      completed++;
    }
    return completed;
  }
  cancel(traceId: string): void {
    this.candidates.delete(traceId);
    this.waiting.delete(traceId);
  }
  private expire(nowMs: number) {
    for (const map of [this.inputs, this.candidates, this.waiting])
      for (const [id, sample] of map)
        if (nowMs - sample.intentMs > this.options.windowMs) map.delete(id);
    if (this.last && nowMs - this.last.renderMs > this.options.windowMs)
      this.last = null;
  }
  snapshot(nowMs: number) {
    if (time(nowMs)) this.expire(nowMs);
    return Object.freeze({
      method: 'NEXT_RENDER_SUBMISSION' as const,
      captureToResult: this.windows.captureToResult.snapshot(nowMs),
      resultToIntent: this.windows.resultToIntent.snapshot(nowMs),
      intentToCommand: this.windows.intentToCommand.snapshot(nowMs),
      commandToRender: this.windows.commandToRender.snapshot(nowMs),
      captureToRender: this.windows.captureToRender.snapshot(nowMs),
      last: this.last,
      pending: this.inputs.size + this.candidates.size + this.waiting.size,
      rejected: this.rejected,
    });
  }
  pause(): void {
    this.inputs.clear();
    this.candidates.clear();
    this.waiting.clear();
    this.last = null;
    this.renderedAt = -Infinity;
    for (const window of Object.values(this.windows)) window.clear();
  }
  dispose(): void {
    this.pause();
    this.disposed = true;
  }
}
