import type { AppConfig } from '../config/index.ts';
import type { VisionFrame } from '../shared/index.ts';
import type { FrameMetadata } from './BitmapOwnership.ts';
import { isVisionFrame } from './vision.messages.ts';
import type { VisionRequest } from './vision.messages.ts';
import { VisionWorkerRuntime } from './VisionWorkerRuntime.ts';
import { VisionWorkerClient } from './VisionWorkerClient.ts';
import type { WorkerPort } from './VisionWorkerClient.ts';

export interface VisionFixture {
  schemaVersion: 1;
  fixtureId: string;
  source: 'synthetic';
  frames: readonly VisionFrame[];
}
export function parseVisionFixture(value: unknown): VisionFixture {
  if (!value || typeof value !== 'object')
    throw new TypeError('Invalid vision fixture');
  const f = value as Partial<VisionFixture>;
  if (
    f.schemaVersion !== 1 ||
    typeof f.fixtureId !== 'string' ||
    !f.fixtureId ||
    f.source !== 'synthetic' ||
    !Array.isArray(f.frames) ||
    !f.frames.length ||
    !f.frames.every(isVisionFrame)
  )
    throw new TypeError(
      'Expected explicitly synthetic, valid VisionFrame fixture',
    );
  return structuredClone(f as VisionFixture);
}

/** Test transport: explicit completion, no timers, network, model, camera or fabricated real-device claim. */
class ReplayPort implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  private closed = false;
  private session = 'fixture';
  private cursor = 0;
  private pending:
    | {
        resolve: (frame: VisionFrame) => void;
        reject: (error: Error) => void;
        metadata: FrameMetadata;
        startedAt: number;
      }
    | undefined;
  private readonly runtime: VisionWorkerRuntime;
  constructor(
    private readonly fixture: VisionFixture,
    private readonly now: () => number,
  ) {
    this.runtime = new VisionWorkerRuntime(
      async () => ({
        close: () => {
          this.pending?.reject(new Error('Synthetic session disposed'));
          this.pending = undefined;
        },
        processFrame: (_, metadata) =>
          new Promise<VisionFrame>((resolve, reject) => {
            this.pending = { resolve, reject, metadata, startedAt: this.now() };
          }),
      }),
      (message) => {
        queueMicrotask(() => {
          if (!this.closed)
            this.onmessage?.({ data: message } as MessageEvent<unknown>);
        });
      },
      now,
    );
  }
  postMessage(message: VisionRequest): void {
    if (this.closed) throw new Error('Replay transport terminated');
    this.session = message.sessionId;
    queueMicrotask(() => {
      if (this.closed) {
        if (message.type === 'PROCESS_FRAME') message.bitmap.close();
        return;
      }
      void this.runtime.receive(message);
    });
  }
  completeNext(failure = false): boolean {
    const pending = this.pending;
    if (!pending) return false;
    this.pending = undefined;
    if (failure) {
      pending.reject(new Error('Explicit synthetic inference fault'));
      return true;
    }
    const frame = this.fixture.frames[this.cursor++];
    if (!frame) {
      pending.reject(new Error('Replay exhausted'));
      return false;
    }
    pending.resolve({
      ...structuredClone(frame),
      ...pending.metadata,
      resultTimeMs: this.now(),
      inferenceMs: this.now() - pending.startedAt,
    });
    return true;
  }
  metrics() {
    return Object.freeze({
      cursor: this.cursor,
      pending: this.pending ? 1 : 0,
      ...this.runtime.getBitmapMetrics(),
    });
  }
  terminate(): void {
    if (this.closed) return;
    this.closed = true;
    void this.runtime.receive({
      type: 'DISPOSE',
      schemaVersion: 1,
      sessionId: this.session,
    });
    this.onmessage = this.onerror = null;
  }
}

/** Opt-in synthetic fixture client. Never selected by the production application. */
export class MockVisionClient extends VisionWorkerClient {
  readonly mode = 'SYNTHETIC_REPLAY' as const;
  private readonly slot: { current?: ReplayPort };
  constructor(
    fixture: unknown,
    config: Readonly<AppConfig>,
    now: () => number,
  ) {
    if (import.meta.env.PROD || !config.features.mockVision)
      throw new Error(
        'Synthetic vision requires an explicit non-production test flag',
      );
    const parsed = parseVisionFixture(fixture);
    const slot: { current?: ReplayPort } = {};
    super(
      config,
      () => {
        slot.current = new ReplayPort(parsed, now);
        return slot.current;
      },
      now,
    );
    this.slot = slot;
  }
  completeNext(failure = false): boolean {
    return this.slot.current?.completeNext(failure) ?? false;
  }
  getReplayMetrics() {
    return this.slot.current?.metrics();
  }
}
