import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  decodeVisionRequest,
  decodeVisionResponse,
  protocolError,
} from '../../src/vision/index.ts';
import { visionAssetUrls } from '../../src/config/index.ts';
const meta = { schemaVersion: 1, sessionId: 'fixture-session' };
const init = {
  ...meta,
  type: 'INIT',
  assets: visionAssetUrls(),
  options: { runningMode: 'VIDEO', numHands: 1, worldLandmarks: false },
};
const frame = {
  ...meta,
  frameId: 0,
  captureTimeMs: 10,
  resultTimeMs: 20,
  inferenceMs: 10,
  source: { width: 1280, height: 720 },
  hands: [],
};
test('all specified request and response variants have explicit versioned contracts', () => {
  for (const request of [
    init,
    { ...meta, type: 'PAUSE', reason: 'hidden' },
    { ...meta, type: 'RESUME' },
    { ...meta, type: 'DISPOSE' },
    { ...meta, type: 'PING', nonce: 7 },
  ]) {
    assert.equal(
      decodeVisionRequest(globalThis.structuredClone(request)).ok,
      true,
    );
    assert.equal(
      decodeVisionRequest({ ...request, schemaVersion: 2 }).error.code,
      'E-VIS-006',
    );
  }
  for (const response of [
    { ...meta, type: 'READY', modelVersion: 'float16/1' },
    { ...meta, type: 'PAUSED' },
    { ...meta, type: 'DISPOSED' },
    { ...meta, type: 'PONG', nonce: 7 },
    { ...meta, type: 'ERROR', error: protocolError(meta.sessionId, 1) },
    { ...meta, type: 'FRAME_RESULT', frame },
  ]) {
    assert.equal(
      decodeVisionResponse(globalThis.structuredClone(response)).ok,
      true,
    );
    assert.equal(
      decodeVisionResponse({ ...response, schemaVersion: 0 }).error.code,
      'E-VIS-006',
    );
  }
});
test('frame transfer requires a bitmap, finite monotonic metadata and safe frame id', () => {
  const bitmap = { explicitlySynthetic: true };
  const request = {
    ...meta,
    type: 'PROCESS_FRAME',
    bitmap,
    frameId: 1,
    captureTimeMs: 0,
  };
  assert.equal(decodeVisionRequest(request).ok, false);
  assert.equal(decodeVisionRequest(request, (b) => b === bitmap).ok, true);
  for (const patch of [
    { frameId: -1 },
    { frameId: 1.5 },
    { frameId: Number.MAX_SAFE_INTEGER + 1 },
    { captureTimeMs: NaN },
    { captureTimeMs: Infinity },
    { schemaVersion: 2 },
    { sessionId: '' },
  ])
    assert.equal(
      decodeVisionRequest({ ...request, ...patch }, (b) => b === bitmap).ok,
      false,
    );
});
test('unknown messages, remote assets, malformed errors and cross-session DTOs are rejected', () => {
  assert.equal(decodeVisionRequest({ ...meta, type: 'UNKNOWN' }).ok, false);
  assert.equal(
    decodeVisionRequest({
      ...init,
      assets: {
        ...init.assets,
        modelUrl: 'https://example.invalid/model.task',
      },
    }).ok,
    false,
  );
  assert.equal(
    decodeVisionRequest({
      ...init,
      assets: { ...init.assets, modelUrl: '/models/../private' },
    }).ok,
    false,
  );
  assert.equal(
    decodeVisionRequest({ ...init, options: { ...init.options, numHands: 0 } })
      .ok,
    false,
  );
  assert.equal(
    decodeVisionResponse({ ...meta, type: 'ERROR', error: {} }).ok,
    false,
  );
  assert.equal(
    decodeVisionResponse({
      ...meta,
      type: 'FRAME_RESULT',
      frame: { ...frame, sessionId: 'old' },
    }).ok,
    false,
  );
  assert.equal(
    decodeVisionResponse({
      ...meta,
      type: 'FRAME_RESULT',
      frame: { ...frame, source: { width: 0, height: 720 } },
    }).ok,
    false,
  );
  assert.equal(
    decodeVisionResponse({
      ...meta,
      type: 'FRAME_RESULT',
      frame: { ...frame, hands: [{}] },
    }).ok,
    false,
  );
});
