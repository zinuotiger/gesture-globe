import type { VisionFrame } from '../shared/index.ts';
import type { VisionRequest } from './vision.messages.ts';

export type ProcessFrameRequest = Extract<
  VisionRequest,
  { type: 'PROCESS_FRAME' }
>;
export type FrameMetadata = Readonly<
  Pick<
    VisionFrame,
    'schemaVersion' | 'sessionId' | 'frameId' | 'captureTimeMs' | 'source'
  >
>;
/** Scalar lifetime counters only; no frame, image or landmark history. */
export class BitmapOwnership {
  private received = 0;
  private closed = 0;
  private active = 0;
  private maximumActive = 0;
  private failed = 0;
  getMetrics() {
    return Object.freeze({
      received: this.received,
      closed: this.closed,
      active: this.active,
      maximumActive: this.maximumActive,
      failed: this.failed,
    });
  }
  discard(bitmap: ImageBitmap): void {
    this.received++;
    bitmap.close();
    this.closed++;
  }
  async process<T>(
    request: ProcessFrameRequest,
    use: (bitmap: ImageBitmap, metadata: FrameMetadata) => T | Promise<T>,
  ): Promise<T> {
    this.received++;
    this.active++;
    this.maximumActive = Math.max(this.maximumActive, this.active);
    try {
      const { width, height } = request.bitmap;
      if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width <= 0 ||
        height <= 0 ||
        !Number.isSafeInteger(request.frameId) ||
        request.frameId < 0 ||
        !Number.isFinite(request.captureTimeMs) ||
        request.captureTimeMs < 0 ||
        request.schemaVersion !== 1 ||
        !request.sessionId
      )
        throw new Error('Invalid bitmap/frame metadata');
      const metadata: FrameMetadata = Object.freeze({
        schemaVersion: 1,
        sessionId: request.sessionId,
        frameId: request.frameId,
        captureTimeMs: request.captureTimeMs,
        source: Object.freeze({ width, height }),
      });
      return await use(request.bitmap, metadata);
    } catch (error) {
      this.failed++;
      throw error;
    } finally {
      request.bitmap.close();
      this.closed++;
      this.active--;
    }
  }
}
