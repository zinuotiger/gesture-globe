import { defaults } from '../config/index.ts';
import type { AppConfig } from '../config/index.ts';
import type { AppError, Result } from '../shared/index.ts';
import type { VisionStart, VisionWorkerClient } from './VisionWorkerClient.ts';

export interface VisionHealthState {
  phase: 'STOPPED' | 'STARTING' | 'HEALTHY' | 'RESTARTING' | 'DEGRADED';
  restarts: number;
  error: AppError | undefined;
}
/** Owns one restart budget per explicit activation. Timers probe liveness, never synthesize recognition. */
export class VisionHealthMonitor {
  private options: VisionStart | undefined;
  private epoch = 0;
  private connecting = false;
  private paused = false;
  private disposed = false;
  private nonce = 0;
  private probe: { nonce: number; atMs: number } | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private state: Readonly<VisionHealthState> = Object.freeze({
    phase: 'STOPPED',
    restarts: 0,
    error: undefined,
  });
  private listeners = new Set<(state: Readonly<VisionHealthState>) => void>();
  private unsubscriptions: (() => void)[];
  private pending: Promise<Result<void>> | undefined;
  private samples = { count: 0, totalInferenceMs: 0, maxInferenceMs: 0 };
  constructor(
    private readonly client: VisionWorkerClient,
    private readonly config: Readonly<AppConfig> = defaults,
    private readonly now: () => number = () =>
      performance.timeOrigin + performance.now(),
  ) {
    this.unsubscriptions = [
      client.subscribe((state) => {
        if (
          state.phase !== 'ERROR' ||
          !state.error ||
          this.connecting ||
          !this.options
        )
          return;
        const epoch = this.epoch,
          error = state.error;
        // Never re-enter client.start during its failure notification/settlement.
        queueMicrotask(() => {
          if (epoch === this.epoch && this.options && !this.connecting)
            void this.recover(error, epoch);
        });
      }),
      client.onHeartbeat((nonce) => {
        if (this.probe?.nonce === nonce) this.probe = undefined;
      }),
      client.onFrame((frame) => {
        this.samples.count++;
        this.samples.totalInferenceMs += frame.inferenceMs;
        this.samples.maxInferenceMs = Math.max(
          this.samples.maxInferenceMs,
          frame.inferenceMs,
        );
      }),
    ];
  }
  getState() {
    return this.state;
  }
  getMetrics() {
    return Object.freeze({
      count: this.samples.count,
      meanInferenceMs: this.samples.count
        ? this.samples.totalInferenceMs / this.samples.count
        : 0,
      maxInferenceMs: this.samples.maxInferenceMs,
    });
  }
  subscribe(listener: (state: Readonly<VisionHealthState>) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish(
    phase: VisionHealthState['phase'],
    error?: AppError,
    restarts = this.state.restarts,
  ) {
    this.state = Object.freeze({ phase, error, restarts });
    for (const listener of this.listeners) listener(this.state);
  }
  private clearProbe() {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.probe = undefined;
  }
  private retryable(error: AppError) {
    return (
      ['E-VIS-001', 'E-VIS-002', 'E-VIS-003'].includes(error.code) &&
      error.technical?.name !== 'INIT_TIMEOUT'
    );
  }
  private degrade(error: AppError): Result<void> {
    this.clearProbe();
    this.client.stop();
    this.publish('DEGRADED', error);
    return { ok: false, error };
  }
  private cancelled(): Result<void> {
    return {
      ok: false,
      error: {
        schemaVersion: 1,
        id: `health-cancel-${this.epoch}`,
        code: 'E-VIS-003',
        module: 'M04',
        severity: 'INFO',
        recoverable: true,
        retryPolicy: 'USER',
        messageKey: 'vision.CANCELLED',
        atMs: this.now(),
        technical: { name: 'CANCELLED' },
      },
    };
  }
  private async connect(epoch: number): Promise<Result<void>> {
    this.connecting = true;
    const result = await this.client.start(this.options!);
    if (epoch !== this.epoch) return result;
    this.connecting = false;
    if (!result.ok) return this.recover(result.error, epoch);
    this.publish('HEALTHY');
    if (epoch !== this.epoch || !this.options) return this.cancelled();
    if (this.paused) this.client.pause('HEALTH_PAUSED');
    this.clearProbe();
    this.timer = setInterval(
      () => this.tick(),
      this.config.vision.heartbeatIntervalMs,
    );
    return result;
  }
  private async recover(error: AppError, epoch: number): Promise<Result<void>> {
    if (
      !this.retryable(error) ||
      this.state.restarts >= this.config.vision.maxAutoRestarts
    )
      return this.degrade(error);
    this.clearProbe();
    this.publish('RESTARTING', error, this.state.restarts + 1);
    if (epoch !== this.epoch || !this.options) return { ok: false, error };
    this.client.stop();
    return this.connect(epoch);
  }
  start(options: VisionStart): Promise<Result<void>> {
    if (this.disposed) throw new Error('VisionHealthMonitor is disposed');
    if (this.options?.sessionId === options.sessionId) {
      if (this.pending) return this.pending;
      if (this.state.phase === 'HEALTHY')
        return Promise.resolve({ ok: true, value: undefined });
    }
    this.stop();
    this.options = options;
    this.samples = { count: 0, totalInferenceMs: 0, maxInferenceMs: 0 };
    const epoch = this.epoch;
    this.publish('STARTING', undefined, 0);
    if (epoch !== this.epoch || !this.options)
      return Promise.resolve(this.cancelled());
    const work = this.connect(epoch).finally(() => {
      if (epoch === this.epoch) this.pending = undefined;
    });
    this.pending = work;
    return work;
  }
  /** Public tick permits deterministic fault tests; production uses the bounded probe timer. */
  tick(): void {
    if (
      !this.options ||
      this.connecting ||
      this.paused ||
      this.state.phase !== 'HEALTHY'
    )
      return;
    const atMs = this.now();
    if (this.probe) {
      if (atMs - this.probe.atMs < this.config.vision.heartbeatTimeoutMs)
        return;
      const error: AppError = {
        schemaVersion: 1,
        id: `heartbeat-${this.nonce}`,
        code: 'E-VIS-003',
        module: 'M04',
        severity: 'ERROR',
        recoverable: true,
        retryPolicy: 'AUTO_ONCE',
        messageKey: 'vision.heartbeatTimeout',
        atMs,
        sessionId: this.options.sessionId,
        technical: { name: 'HEARTBEAT_TIMEOUT' },
      };
      void this.recover(error, this.epoch);
      return;
    }
    const nonce = ++this.nonce;
    this.probe = { nonce, atMs };
    this.client.ping(nonce);
  }
  pause(reason = 'PAGE_HIDDEN'): void {
    this.paused = true;
    this.probe = undefined;
    this.client.pause(reason);
  }
  resume(): void {
    this.paused = false;
    this.probe = undefined;
    this.client.resume();
  }
  stop(): void {
    ++this.epoch;
    this.options = undefined;
    this.connecting = false;
    this.pending = undefined;
    this.paused = false;
    this.clearProbe();
    this.client.stop();
    this.publish('STOPPED');
  }
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    for (const unsubscribe of this.unsubscriptions) unsubscribe();
    this.listeners.clear();
  }
}
