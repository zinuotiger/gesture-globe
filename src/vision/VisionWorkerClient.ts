import { defaults, visionAssetUrls } from '../config/index.ts';
import type { AppConfig } from '../config/index.ts';
import type { AppError, Result, VisionFrame } from '../shared/index.ts';
import { createVisionWorker } from './createVisionWorker.ts';
import {
  decodeVisionResponse,
  decodeVisionRequest,
  protocolError,
} from './vision.messages.ts';
import type {
  VisionAssets,
  VisionOptions,
  VisionRequest,
} from './vision.messages.ts';

export interface WorkerPort {
  postMessage(message: VisionRequest, transfer: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
export interface VisionClientState {
  phase:
    | 'IDLE'
    | 'INITIALIZING'
    | 'READY'
    | 'PAUSED'
    | 'RESUMING'
    | 'ERROR'
    | 'DISPOSED';
  sessionId: string | undefined;
  error: AppError | undefined;
}
export interface VisionStart {
  sessionId: string;
  assets?: VisionAssets;
  options?: VisionOptions;
}
export class VisionWorkerClient {
  private worker: WorkerPort | undefined;
  private generation = 0;
  private pending: Promise<Result<void>> | undefined;
  private settle: ((value: Result<void>) => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private state: Readonly<VisionClientState> = Object.freeze({
    phase: 'IDLE',
    sessionId: undefined,
    error: undefined,
  });
  private listeners = new Set<(state: Readonly<VisionClientState>) => void>();
  private frames = new Set<(frame: VisionFrame) => void>();
  private settledFrames = new Set<(frameId: number) => void>();
  private heartbeats = new Set<(nonce: number) => void>();
  private consecutiveErrors = 0;
  private lastApplied = -1;
  private lastSubmitted = -1;
  private minimumFrame = 0;
  private pauseAcknowledged = false;
  private resumeRequested = false;
  private drops = { stale: 0, order: 0, paused: 0, clock: 0 };
  private ignored = 0;
  constructor(
    private readonly config: Readonly<AppConfig> = defaults,
    private readonly factory: () => WorkerPort = createVisionWorker,
    private readonly now: () => number = () =>
      performance.timeOrigin + performance.now(),
  ) {}
  getState() {
    return this.state;
  }
  get ignoredSessionMessages() {
    return this.ignored;
  }
  subscribe(listener: (state: Readonly<VisionClientState>) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  onFrame(listener: (frame: VisionFrame) => void) {
    this.frames.add(listener);
    return () => {
      this.frames.delete(listener);
    };
  }
  /** Scheduler acknowledgement is independent of whether a DTO may drive control. */
  onFrameSettled(listener: (frameId: number) => void) {
    this.settledFrames.add(listener);
    return () => {
      this.settledFrames.delete(listener);
    };
  }
  getDropMetrics() {
    return Object.freeze({ ...this.drops });
  }
  onHeartbeat(listener: (nonce: number) => void) {
    this.heartbeats.add(listener);
    return () => {
      this.heartbeats.delete(listener);
    };
  }
  ping(nonce: number): boolean {
    if (
      !Number.isSafeInteger(nonce) ||
      nonce < 0 ||
      !this.worker ||
      !this.state.sessionId ||
      !['READY', 'PAUSED', 'RESUMING'].includes(this.state.phase)
    )
      return false;
    try {
      this.worker.postMessage(
        {
          type: 'PING',
          schemaVersion: 1,
          sessionId: this.state.sessionId,
          nonce,
        },
        [],
      );
      return true;
    } catch {
      this.fail(this.error('E-VIS-003', 'HEARTBEAT_SEND'));
      return false;
    }
  }
  private publish(phase: VisionClientState['phase'], error?: AppError) {
    this.state = Object.freeze({
      phase,
      sessionId: this.state.sessionId,
      error,
    });
    for (const listener of this.listeners) listener(this.state);
  }
  private error(code: 'E-VIS-001' | 'E-VIS-003', reason: string): AppError {
    return {
      schemaVersion: 1,
      id: `client-${this.generation}`,
      code,
      module: 'M04',
      severity: reason === 'CANCELLED' ? 'INFO' : 'ERROR',
      recoverable: true,
      retryPolicy: 'USER',
      messageKey: `vision.${reason}`,
      atMs: this.now(),
      ...(this.state.sessionId ? { sessionId: this.state.sessionId } : {}),
      technical: { name: reason },
    };
  }
  private finish(value: Result<void>) {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const settle = this.settle;
    this.pending = undefined;
    this.settle = undefined;
    settle?.(value);
  }
  private detach() {
    ++this.generation;
    const worker = this.worker;
    this.worker = undefined;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
  }
  private fail(error: AppError) {
    this.detach();
    this.publish('ERROR', error);
    this.finish({ ok: false, error });
  }
  start(options: VisionStart): Promise<Result<void>> {
    if (this.state.phase === 'DISPOSED')
      return Promise.resolve({
        ok: false,
        error: this.error('E-VIS-003', 'DISPOSED'),
      });
    if (this.state.sessionId === options.sessionId) {
      if (this.pending) return this.pending;
      if (this.state.phase === 'READY')
        return Promise.resolve({ ok: true, value: undefined });
    }
    this.stop();
    this.lastApplied = this.lastSubmitted = -1;
    this.minimumFrame = 0;
    this.consecutiveErrors = 0;
    this.state = Object.freeze({
      phase: 'IDLE',
      sessionId: options.sessionId,
      error: undefined,
    });
    const request: VisionRequest = {
      type: 'INIT',
      schemaVersion: 1,
      sessionId: options.sessionId,
      assets: options.assets ?? visionAssetUrls(),
      options: options.options ?? {
        runningMode: 'VIDEO',
        numHands: this.config.vision.numHands as 1 | 2,
        worldLandmarks: this.config.vision.worldLandmarks,
      },
    };
    const valid = decodeVisionRequest(request);
    if (!valid.ok) {
      this.publish('ERROR', valid.error);
      return Promise.resolve(valid);
    }
    const pending = new Promise<Result<void>>((resolve) => {
      this.settle = resolve;
    });
    this.pending = pending;
    this.publish('INITIALIZING');
    const generation = ++this.generation;
    try {
      const worker = this.factory();
      this.worker = worker;
      worker.onmessage = (event) => {
        const data = event.data;
        if (
          generation !== this.generation ||
          worker !== this.worker ||
          (data &&
            typeof data === 'object' &&
            'sessionId' in data &&
            data.sessionId !== options.sessionId)
        ) {
          this.ignored++;
          return;
        }
        const result = decodeVisionResponse(data);
        if (!result.ok) {
          this.fail(result.error);
          return;
        }
        const message = result.value;
        if (message.type === 'PONG') {
          for (const listener of this.heartbeats) listener(message.nonce);
          return;
        }
        if (message.type === 'ERROR') {
          if (
            message.error.code === 'E-VIS-004' &&
            message.frameId !== undefined &&
            this.state.phase === 'READY'
          ) {
            for (const listener of this.settledFrames)
              listener(message.frameId);
            if (
              ++this.consecutiveErrors < this.config.vision.maxConsecutiveErrors
            )
              return;
          }
          this.fail(message.error);
          return;
        }
        if (
          message.type === 'READY' &&
          (this.state.phase === 'INITIALIZING' ||
            this.state.phase === 'RESUMING')
        ) {
          this.publish('READY');
          this.finish({ ok: true, value: undefined });
          return;
        }
        if (message.type === 'PAUSED' && this.state.phase === 'PAUSED') {
          this.pauseAcknowledged = true;
          if (this.resumeRequested) this.resume();
          return;
        }
        if (message.type === 'FRAME_RESULT') {
          const frame = message.frame;
          this.consecutiveErrors = 0;
          for (const listener of this.settledFrames) listener(frame.frameId);
          if (this.state.phase !== 'READY') {
            this.drops.paused++;
            return;
          }
          if (
            frame.frameId <= this.lastApplied ||
            frame.frameId < this.minimumFrame
          ) {
            this.drops.order++;
            return;
          }
          const age = this.now() - frame.captureTimeMs;
          if (
            !Number.isFinite(age) ||
            age < 0 ||
            frame.resultTimeMs < frame.captureTimeMs
          ) {
            this.drops.clock++;
            return;
          }
          if (age > this.config.vision.staleFrameMs) {
            this.drops.stale++;
            return;
          }
          this.lastApplied = frame.frameId;
          for (const listener of this.frames) listener(frame);
          return;
        }
        this.fail(protocolError(options.sessionId, this.now()));
      };
      worker.onerror = () => {
        if (generation === this.generation)
          this.fail(this.error('E-VIS-003', 'WORKER_CRASH'));
      };
      this.timer = setTimeout(() => {
        if (generation === this.generation)
          this.fail(this.error('E-VIS-001', 'INIT_TIMEOUT'));
      }, this.config.vision.initTimeoutMs);
      worker.postMessage(request, []);
    } catch {
      this.fail(this.error('E-VIS-003', 'WORKER_START'));
    }
    return pending;
  }
  /** Ownership passes to this method; rejected/failed sends close locally. */
  submit(frame: {
    frameId: number;
    captureTimeMs: number;
    bitmap: ImageBitmap;
  }): boolean {
    const request: VisionRequest = {
      ...frame,
      type: 'PROCESS_FRAME',
      schemaVersion: 1,
      sessionId: this.state.sessionId ?? 'inactive',
    };
    if (
      this.state.phase !== 'READY' ||
      !this.worker ||
      !decodeVisionRequest(request).ok
    ) {
      frame.bitmap.close();
      return false;
    }
    try {
      this.lastSubmitted = Math.max(this.lastSubmitted, frame.frameId);
      this.worker.postMessage(request, [frame.bitmap]);
      return true;
    } catch {
      frame.bitmap.close();
      this.fail(this.error('E-VIS-003', 'TRANSFER_FAILED'));
      return false;
    }
  }
  pause(reason = 'GESTURE_DISABLED'): boolean {
    if (this.state.phase === 'PAUSED') {
      this.resumeRequested = false;
      return true;
    }
    if (this.state.phase !== 'READY' || !this.worker || !this.state.sessionId)
      return false;
    this.minimumFrame = this.lastSubmitted + 1;
    this.pauseAcknowledged = false;
    this.resumeRequested = false;
    this.publish('PAUSED');
    try {
      this.worker.postMessage(
        {
          type: 'PAUSE',
          schemaVersion: 1,
          sessionId: this.state.sessionId,
          reason,
        },
        [],
      );
      return true;
    } catch {
      this.fail(this.error('E-VIS-003', 'PAUSE_FAILED'));
      return false;
    }
  }
  resume(): boolean {
    if (this.state.phase === 'READY' || this.state.phase === 'RESUMING')
      return true;
    if (this.state.phase !== 'PAUSED' || !this.worker || !this.state.sessionId)
      return false;
    this.resumeRequested = true;
    if (!this.pauseAcknowledged) return true;
    this.publish('RESUMING');
    try {
      this.worker.postMessage(
        { type: 'RESUME', schemaVersion: 1, sessionId: this.state.sessionId },
        [],
      );
      return true;
    } catch {
      this.fail(this.error('E-VIS-003', 'RESUME_FAILED'));
      return false;
    }
  }
  stop(): void {
    if (this.state.phase === 'DISPOSED') return;
    const worker = this.worker;
    if (worker && this.state.sessionId) {
      try {
        worker.postMessage(
          {
            type: 'DISPOSE',
            schemaVersion: 1,
            sessionId: this.state.sessionId,
          },
          [],
        );
      } catch {
        /* Termination below is mandatory even when the worker is broken. */
      }
    }
    this.detach();
    this.resumeRequested = this.pauseAcknowledged = false;
    this.finish({ ok: false, error: this.error('E-VIS-003', 'CANCELLED') });
    this.state = Object.freeze({ ...this.state, sessionId: undefined });
    this.publish('IDLE');
  }
  dispose(): void {
    if (this.state.phase === 'DISPOSED') return;
    this.stop();
    this.publish('DISPOSED');
    this.listeners.clear();
    this.frames.clear();
    this.settledFrames.clear();
    this.heartbeats.clear();
  }
}
