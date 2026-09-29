import { isPlainDto } from '../shared/index.ts';
import type { AppError, Result, VisionFrame } from '../shared/index.ts';

export interface VisionAssets {
  modelUrl: string;
  wasmRoot: string;
  sdkVersion: string;
}
export interface VisionOptions {
  runningMode: 'VIDEO';
  numHands: 1 | 2;
  worldLandmarks: boolean;
}
interface Metadata {
  schemaVersion: 1;
  sessionId: string;
}
export type VisionRequest = Metadata &
  (
    | { type: 'INIT'; assets: VisionAssets; options: VisionOptions }
    | {
        type: 'PROCESS_FRAME';
        frameId: number;
        captureTimeMs: number;
        bitmap: ImageBitmap;
      }
    | { type: 'PAUSE'; reason: string }
    | { type: 'PING'; nonce: number }
    | { type: 'RESUME' | 'DISPOSE' }
  );
export type VisionResponse = Metadata &
  (
    | { type: 'READY'; modelVersion: string }
    | { type: 'FRAME_RESULT'; frame: VisionFrame }
    | { type: 'PONG'; nonce: number }
    | { type: 'PAUSED' | 'DISPOSED' }
    | { type: 'ERROR'; error: AppError; frameId?: number }
  );

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown): value is number =>
  finite(value) && value > 0;
const nonnegative = (value: unknown): value is number =>
  finite(value) && value >= 0;
const integer = (value: unknown): value is number =>
  nonnegative(value) && Number.isSafeInteger(value);
const score = (value: unknown): value is number =>
  nonnegative(value) && value <= 1;
const local = (value: unknown): value is string =>
  text(value) &&
  /^\/models\/[\w./-]+$/.test(value) &&
  !value.split('/').some((part) => part === '..' || part === '.');
const metadata = (
  value: unknown,
): value is Record<string, unknown> & Metadata =>
  record(value) && value.schemaVersion === 1 && text(value.sessionId);

export function protocolError(sessionId: string, atMs: number): AppError {
  return {
    schemaVersion: 1,
    id: `protocol-${sessionId}`,
    code: 'E-VIS-006',
    module: 'M04',
    severity: 'ERROR',
    recoverable: false,
    retryPolicy: 'NONE',
    messageKey: 'vision.protocolInvalid',
    atMs,
    sessionId,
  };
}
const rejected = (value: unknown): Result<never> => ({
  ok: false,
  error: protocolError(
    record(value) && text(value.sessionId) ? value.sessionId : 'invalid',
    0,
  ),
});

/** The bitmap checker is injectable only to permit explicit non-browser fixtures. */
export function decodeVisionRequest(
  value: unknown,
  bitmapCheck: (value: unknown) => boolean = (bitmap) =>
    typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap,
): Result<VisionRequest> {
  if (!metadata(value)) return rejected(value);
  let valid = false;
  switch (value.type) {
    case 'INIT': {
      const assets = value.assets,
        options = value.options;
      valid =
        isPlainDto(value) &&
        record(assets) &&
        local(assets.modelUrl) &&
        local(assets.wasmRoot) &&
        text(assets.sdkVersion) &&
        /^\d+\.\d+\.\d+$/.test(assets.sdkVersion) &&
        record(options) &&
        options.runningMode === 'VIDEO' &&
        [1, 2].includes(options.numHands as number) &&
        typeof options.worldLandmarks === 'boolean';
      break;
    }
    case 'PROCESS_FRAME':
      valid =
        integer(value.frameId) &&
        nonnegative(value.captureTimeMs) &&
        bitmapCheck(value.bitmap);
      break;
    case 'PAUSE':
      valid = isPlainDto(value) && text(value.reason);
      break;
    case 'PING':
      valid = isPlainDto(value) && integer(value.nonce);
      break;
    case 'RESUME':
    case 'DISPOSE':
      valid = isPlainDto(value);
      break;
  }
  return valid
    ? { ok: true, value: value as unknown as VisionRequest }
    : rejected(value);
}

export function isVisionFrame(value: unknown): value is VisionFrame {
  if (
    !metadata(value) ||
    !isPlainDto(value) ||
    !integer(value.frameId) ||
    !nonnegative(value.captureTimeMs) ||
    !nonnegative(value.resultTimeMs) ||
    !nonnegative(value.inferenceMs) ||
    !record(value.source) ||
    !positive(value.source.width) ||
    !positive(value.source.height) ||
    !Array.isArray(value.hands) ||
    value.hands.length > 2
  )
    return false;
  const landmarks = (points: unknown) =>
    Array.isArray(points) &&
    points.length === 21 &&
    points.every(
      (p: unknown) => record(p) && finite(p.x) && finite(p.y) && finite(p.z),
    );
  return value.hands.every(
    (hand: unknown) =>
      record(hand) &&
      text(hand.localId) &&
      ['Left', 'Right', 'Unknown'].includes(hand.handedness as string) &&
      score(hand.handednessScore) &&
      landmarks(hand.landmarks) &&
      (hand.worldLandmarks === undefined || landmarks(hand.worldLandmarks)) &&
      Array.isArray(hand.gestures) &&
      hand.gestures.every(
        (g: unknown) => record(g) && text(g.name) && score(g.score),
      ) &&
      record(hand.bbox) &&
      finite(hand.bbox.x) &&
      finite(hand.bbox.y) &&
      nonnegative(hand.bbox.width) &&
      nonnegative(hand.bbox.height),
  );
}

export function decodeVisionResponse(value: unknown): Result<VisionResponse> {
  if (!metadata(value) || !isPlainDto(value)) return rejected(value);
  let valid = false;
  switch (value.type) {
    case 'READY':
      valid = text(value.modelVersion);
      break;
    case 'FRAME_RESULT':
      valid =
        isVisionFrame(value.frame) && value.frame.sessionId === value.sessionId;
      break;
    case 'PONG':
      valid = integer(value.nonce);
      break;
    case 'PAUSED':
    case 'DISPOSED':
      valid = true;
      break;
    case 'ERROR': {
      const e = value.error;
      valid =
        record(e) &&
        e.schemaVersion === 1 &&
        text(e.id) &&
        typeof e.code === 'string' &&
        /^E-VIS-00[1-6]$/.test(e.code) &&
        e.module === 'M04' &&
        ['INFO', 'WARNING', 'ERROR', 'FATAL'].includes(e.severity as string) &&
        typeof e.recoverable === 'boolean' &&
        ['NONE', 'USER', 'AUTO_ONCE'].includes(e.retryPolicy as string) &&
        text(e.messageKey) &&
        nonnegative(e.atMs) &&
        (value.frameId === undefined || integer(value.frameId)) &&
        (e.sessionId === undefined || e.sessionId === value.sessionId);
      break;
    }
  }
  return valid
    ? { ok: true, value: value as unknown as VisionResponse }
    : rejected(value);
}
