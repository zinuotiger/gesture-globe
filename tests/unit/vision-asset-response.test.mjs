import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test, vi } from 'vitest';
import { verifyVisionResponse } from '../../src/vision/verifyVisionAsset.ts';
import { loadRecognizer } from '../../src/vision/loadRecognizer.ts';
import { visionAssetUrls } from '../../src/config/index.ts';
const bytes = new Uint8Array([0x50, 0x4b, 1, 2, 3, 4, 5, 6]);
const expected = {
  sizeBytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
const response = (body, mime = 'application/octet-stream', status = 200) =>
  new globalThis.Response(body, { status, headers: { 'content-type': mime } });
test('verified binary passes; HTTP, MIME, HTML, JSON, empty, size and digest failures stay distinct', async () => {
  assert.deepEqual(
    await verifyVisionResponse(response(bytes), expected, 'MODEL'),
    bytes,
  );
  assert.deepEqual(
    await verifyVisionResponse(
      new globalThis.Response(bytes),
      expected,
      'MODEL',
    ),
    bytes,
  );
  for (const [body, mime, status, reason] of [
    [bytes, 'application/octet-stream', 404, 'HTTP'],
    [bytes, 'text/plain', 200, 'MIME'],
    ['<html>', 'application/octet-stream', 200, 'HTML'],
    ['{}', 'application/octet-stream', 200, 'JSON'],
    ['', 'application/octet-stream', 200, 'EMPTY'],
    ['PK', 'application/octet-stream', 200, 'SIZE'],
    [new Uint8Array(8), 'application/octet-stream', 200, 'SHA256'],
    [new Uint8Array(9), 'application/octet-stream', 200, 'SIZE'],
  ])
    await assert.rejects(
      verifyVisionResponse(response(body, mime, status), expected, 'MODEL'),
      (e) => e.code === 'E-VIS-001' && e.reason === reason,
    );
  await assert.rejects(
    verifyVisionResponse(response(bytes, 'text/html'), expected, 'WASM'),
    (e) => e.code === 'E-VIS-002' && e.reason === 'HTML',
  );
});
test('invalid model short-circuits before SDK/WASM loading', async () => {
  const fetch = vi.fn(async () => response('<html>', 'text/html'));
  vi.stubGlobal('fetch', fetch);
  try {
    await assert.rejects(
      loadRecognizer({
        assets: visionAssetUrls(),
        options: { runningMode: 'VIDEO', numHands: 1, worldLandmarks: false },
      }),
      (e) => e.code === 'E-VIS-001' && e.reason === 'HTML',
    );
    assert.equal(fetch.mock.calls.length, 1);
  } finally {
    vi.unstubAllGlobals();
  }
});
