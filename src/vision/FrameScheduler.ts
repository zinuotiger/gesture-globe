import { defaults, numericRules } from '../config/index.ts';
import type { AppConfig } from '../config/index.ts';
import type { VisionWorkerClient } from './VisionWorkerClient.ts';

export interface FrameSource {
  isReady(): boolean;
  capture(): Promise<ImageBitmap>;
}
type FrameClient = Pick<
  VisionWorkerClient,
  'getState' | 'subscribe' | 'onFrameSettled' | 'submit'
>;
export interface FrameMetrics {
  submitted: number;
  droppedBusy: number;
  droppedRate: number;
  droppedUnavailable: number;
  droppedCancelled: number;
  invalidClock: number;
  captureErrors: number;
  transferErrors: number;
  inFlight: 0 | 1;
  targetHz: number;
}

/** Tick-driven latest-only scheduling. Capturing and inference share one slot. */
export class FrameScheduler {
  private source: FrameSource | undefined;
  private capturing = false;
  private waitingFrame: number | undefined;
  private generation = 0;
  private frameId = 0;
  private due = -Infinity;
  private previousTick = -Infinity;
  private disposed = false;
  private targetHz: number;
  private counters = {
    submitted: 0,
    droppedBusy: 0,
    droppedRate: 0,
    droppedUnavailable: 0,
    droppedCancelled: 0,
    invalidClock: 0,
    captureErrors: 0,
    transferErrors: 0,
  };
  private unsubscribeFrame: () => void;
  private unsubscribeState: () => void;
  constructor(
    private readonly client: FrameClient,
    private readonly config: Readonly<AppConfig> = defaults,
    private readonly now: () => number = () =>
      performance.timeOrigin + performance.now(),
  ) {
    this.targetHz = config.vision.targetHz;
    this.unsubscribeFrame = client.onFrameSettled((frameId) => {
      if (this.waitingFrame === frameId) this.waitingFrame = undefined;
    });
    this.unsubscribeState = client.subscribe((state) => {
      if (state.phase !== 'READY') {
        this.generation++;
        this.waitingFrame = undefined;
      }
    });
  }
  getMetrics(): Readonly<FrameMetrics> {
    return Object.freeze({
      ...this.counters,
      inFlight: this.capturing || this.waitingFrame !== undefined ? 1 : 0,
      targetHz: this.targetHz,
    });
  }
  setTargetHz(hz: number): void {
    const rule = numericRules['vision.targetHz']!;
    if (
      !Number.isFinite(hz) ||
      (!Number.isInteger(hz) && hz !== this.config.vision.targetHz) ||
      hz < Math.max(rule.min, this.config.vision.minHz) ||
      hz > rule.max
    )
      throw new RangeError('Invalid inference target Hz');
    this.targetHz = hz;
  }
  start(source: FrameSource): void {
    if (this.disposed) throw new Error('FrameScheduler is disposed');
    this.stop();
    this.source = source;
    this.due = -Infinity;
    this.previousTick = -Infinity;
  }
  tick(atMs: number = this.now()): void {
    if (this.disposed || !this.source) return;
    if (!Number.isFinite(atMs) || atMs < 0 || atMs < this.previousTick) {
      this.counters.invalidClock++;
      return;
    }
    this.previousTick = atMs;
    if (this.capturing || this.waitingFrame !== undefined) {
      this.counters.droppedBusy++;
      return;
    }
    if (this.client.getState().phase !== 'READY' || !this.source.isReady()) {
      this.counters.droppedUnavailable++;
      return;
    }
    if (atMs < this.due) {
      this.counters.droppedRate++;
      return;
    }
    this.due = atMs + 1000 / this.targetHz;
    const generation = this.generation;
    const frameId = this.frameId++;
    const source = this.source;
    this.capturing = true;
    void Promise.resolve()
      .then(() => source.capture())
      .then((bitmap) => {
        if (
          generation !== this.generation ||
          !this.source ||
          this.disposed ||
          this.client.getState().phase !== 'READY'
        ) {
          bitmap.close();
          this.counters.droppedCancelled++;
          return;
        }
        this.waitingFrame = frameId;
        // Client owns close on rejection/transfer failure; successful send transfers ownership.
        if (this.client.submit({ frameId, captureTimeMs: atMs, bitmap }))
          this.counters.submitted++;
        else {
          this.waitingFrame = undefined;
          this.counters.transferErrors++;
        }
      })
      .catch(() => {
        this.waitingFrame = undefined;
        this.counters.captureErrors++;
      })
      .finally(() => {
        this.capturing = false;
      });
  }
  stop(): void {
    ++this.generation;
    this.source = undefined;
    // Keep the slot until pending capture/result settles. Rapid restart cannot queue.
  }
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.unsubscribeFrame();
    this.unsubscribeState();
  }
}
