import type { AppError, VisionFrame } from '../shared/index.ts';
import { BitmapOwnership } from './BitmapOwnership.ts';
import type { FrameMetadata } from './BitmapOwnership.ts';
import { decodeVisionRequest, protocolError } from './vision.messages.ts';
import type { VisionRequest, VisionResponse } from './vision.messages.ts';

export type InitRequest = Extract<VisionRequest, { type: 'INIT' }>;
export interface VisionResource {
  close(): void;
  processFrame?(
    bitmap: ImageBitmap,
    metadata: FrameMetadata,
  ): VisionFrame | Promise<VisionFrame>;
}
export class VisionAssetError extends Error {
  constructor(
    readonly code: 'E-VIS-001' | 'E-VIS-002',
    readonly reason = 'INITIALIZATION',
  ) {
    super(code);
  }
}

/** Dedicated-worker lifecycle; no camera, DOM, rendering or stored frame history. */
export class VisionWorkerRuntime {
  private generation = 0;
  private session: string | undefined;
  private resource: VisionResource | undefined;
  private loading = false;
  private processing = false;
  private paused = false;
  private frameEpoch = 0;
  private pauseReplyPending = false;
  private bitmaps = new BitmapOwnership();
  getBitmapMetrics() {
    return this.bitmaps.getMetrics();
  }
  constructor(
    private readonly load: (request: InitRequest) => Promise<VisionResource>,
    private readonly send: (response: VisionResponse) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}
  async receive(data: unknown): Promise<void> {
    const decoded = decodeVisionRequest(data);
    if (!decoded.ok) {
      if (
        data &&
        typeof data === 'object' &&
        'bitmap' in data &&
        typeof ImageBitmap !== 'undefined' &&
        data.bitmap instanceof ImageBitmap
      )
        this.bitmaps.discard(data.bitmap);
      this.send({
        type: 'ERROR',
        schemaVersion: 1,
        sessionId: decoded.error.sessionId!,
        error: decoded.error,
      });
      return;
    }
    const request = decoded.value;
    const meta = { schemaVersion: 1 as const, sessionId: request.sessionId };
    const reject = () =>
      this.send({
        ...meta,
        type: 'ERROR',
        error: protocolError(request.sessionId, this.now()),
      });
    if (request.type === 'INIT') {
      if (this.loading || this.resource || this.session) {
        reject();
        return;
      }
      this.session = request.sessionId;
      this.loading = true;
      const generation = ++this.generation;
      try {
        const resource = await this.load(request);
        if (generation !== this.generation) {
          resource.close();
          return;
        }
        this.resource = resource;
        this.send({
          ...meta,
          type: 'READY',
          modelVersion: 'gesture_recognizer/float16/1',
        });
      } catch (cause) {
        if (generation !== this.generation) return;
        const code =
          cause instanceof VisionAssetError ? cause.code : 'E-VIS-001';
        const error: AppError = {
          schemaVersion: 1,
          id: `init-${request.sessionId}`,
          code,
          module: 'M04',
          severity: 'ERROR',
          recoverable: true,
          retryPolicy: 'AUTO_ONCE',
          technical: {
            name:
              cause instanceof VisionAssetError
                ? cause.reason
                : 'INITIALIZATION',
          },
          messageKey:
            code === 'E-VIS-002'
              ? 'vision.wasmLoadFailed'
              : 'vision.modelLoadFailed',
          atMs: this.now(),
          sessionId: request.sessionId,
        };
        this.session = undefined;
        this.send({ ...meta, type: 'ERROR', error });
      } finally {
        if (generation === this.generation) this.loading = false;
      }
      return;
    }
    if (request.type === 'PROCESS_FRAME') {
      const resource = this.resource;
      if (
        this.processing ||
        this.paused ||
        this.loading ||
        request.sessionId !== this.session ||
        !resource?.processFrame
      ) {
        this.bitmaps.discard(request.bitmap);
        reject();
        return;
      }
      const generation = this.generation;
      const epoch = this.frameEpoch;
      this.processing = true;
      try {
        const frame = await this.bitmaps.process(request, (bitmap, metadata) =>
          resource.processFrame!(bitmap, metadata),
        );
        if (
          generation === this.generation &&
          epoch === this.frameEpoch &&
          !this.paused
        )
          this.send({ ...meta, type: 'FRAME_RESULT', frame });
      } catch {
        if (
          generation === this.generation &&
          epoch === this.frameEpoch &&
          !this.paused
        )
          this.send({
            ...meta,
            type: 'ERROR',
            frameId: request.frameId,
            error: {
              schemaVersion: 1,
              id: `frame-${request.frameId}`,
              code: 'E-VIS-004',
              module: 'M04',
              severity: 'WARNING',
              recoverable: true,
              retryPolicy: 'USER',
              messageKey: 'vision.frameFailed',
              atMs: this.now(),
              sessionId: request.sessionId,
            },
          });
      } finally {
        if (generation === this.generation) {
          this.processing = false;
          if (this.pauseReplyPending) {
            this.pauseReplyPending = false;
            this.send({ ...meta, type: 'PAUSED' });
          }
        }
      }
      return;
    }
    if (request.sessionId === this.session && this.resource && !this.loading) {
      if (request.type === 'PING') {
        this.send({ ...meta, type: 'PONG', nonce: request.nonce });
        return;
      }
      if (request.type === 'PAUSE') {
        this.paused = true;
        ++this.frameEpoch;
        this.pauseReplyPending = this.processing;
        if (!this.processing) this.send({ ...meta, type: 'PAUSED' });
        return;
      }
      if (request.type === 'RESUME' && this.paused && !this.processing) {
        this.paused = false;
        this.pauseReplyPending = false;
        ++this.frameEpoch;
        this.send({
          ...meta,
          type: 'READY',
          modelVersion: 'gesture_recognizer/float16/1',
        });
        return;
      }
    }
    if (
      request.type === 'DISPOSE' &&
      (!this.session || request.sessionId === this.session)
    ) {
      ++this.generation;
      this.resource?.close();
      this.resource = undefined;
      this.session = undefined;
      this.loading = false;
      this.processing = false;
      this.paused = this.pauseReplyPending = false;
      ++this.frameEpoch;
      this.send({ ...meta, type: 'DISPOSED' });
      return;
    }
    reject();
  }
}
