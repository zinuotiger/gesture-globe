import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { BitmapOwnership } from '../../src/vision/index.ts';
import { VisionWorkerRuntime } from '../../src/vision/VisionWorkerRuntime.ts';
import { visionAssetUrls } from '../../src/config/index.ts';
import { createCameraFrameSource } from '../../src/app/createCameraFrameSource.ts';
class FixtureBitmap {
  width = 64;
  height = 32;
  closes = 0;
  close() {
    this.closes++;
    this.width = 0;
    this.height = 0;
  }
}
const request = (bitmap, patch = {}) => ({
  type: 'PROCESS_FRAME',
  schemaVersion: 1,
  sessionId: 'fixture',
  frameId: 1,
  captureTimeMs: 123,
  bitmap,
  ...patch,
});
test('owned bitmap closes exactly once after success, rejection, throw, and invalid metadata', async () => {
  const owner = new BitmapOwnership();
  const bitmap = new FixtureBitmap();
  const metadata = await owner.process(request(bitmap), (_, meta) => meta);
  assert.deepEqual(metadata.source, { width: 64, height: 32 });
  assert.equal(metadata.captureTimeMs, 123);
  assert.equal(bitmap.closes, 1);
  for (const use of [
    () => {
      throw new Error('fault');
    },
    async () => {
      throw new Error('async fault');
    },
  ]) {
    const bad = new FixtureBitmap();
    await assert.rejects(owner.process(request(bad), use));
    assert.equal(bad.closes, 1);
  }
  const empty = new FixtureBitmap();
  empty.width = 0;
  await assert.rejects(
    owner.process(request(empty), () => assert.fail('invalid bitmap used')),
  );
  assert.equal(empty.closes, 1);
  assert.deepEqual(owner.getMetrics(), {
    received: 4,
    closed: 4,
    active: 0,
    maximumActive: 1,
    failed: 3,
  });
});
test('worker closes pre-READY, invalid schema, wrong session, busy and failed inference frames', async () => {
  vi.stubGlobal('ImageBitmap', FixtureBitmap);
  try {
    const messages = [];
    let resolve;
    const resource = {
      close() {},
      processFrame: () => new Promise((r) => (resolve = r)),
    };
    const runtime = new VisionWorkerRuntime(
      async () => resource,
      (m) => messages.push(m),
    );
    const early = new FixtureBitmap();
    await runtime.receive(request(early));
    assert.equal(early.closes, 1);
    const version = new FixtureBitmap();
    await runtime.receive(request(version, { schemaVersion: 2 }));
    assert.equal(version.closes, 1);
    await runtime.receive({
      type: 'INIT',
      schemaVersion: 1,
      sessionId: 'fixture',
      assets: visionAssetUrls(),
      options: { runningMode: 'VIDEO', numHands: 1, worldLandmarks: false },
    });
    const old = new FixtureBitmap();
    await runtime.receive(request(old, { sessionId: 'old' }));
    assert.equal(old.closes, 1);
    const active = new FixtureBitmap();
    const processing = runtime.receive(request(active));
    const busy = new FixtureBitmap();
    await runtime.receive(request(busy, { frameId: 2 }));
    assert.equal(busy.closes, 1);
    await runtime.receive({
      type: 'DISPOSE',
      schemaVersion: 1,
      sessionId: 'fixture',
    });
    resolve({});
    await processing;
    assert.equal(active.closes, 1);
    assert.equal(messages.filter((m) => m.type === 'FRAME_RESULT').length, 0);
    assert.equal(
      runtime.getBitmapMetrics().received,
      runtime.getBitmapMetrics().closed,
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
test('camera adapter obtains frames only from the public ready source', async () => {
  const video = { testOnly: true };
  let ready = false;
  let calls = 0;
  const source = createCameraFrameSource(
    { isReady: () => ready, getFrameSource: () => (ready ? video : undefined) },
    async (input) => {
      assert.equal(input, video);
      calls++;
      return new FixtureBitmap();
    },
  );
  await assert.rejects(source.capture(), /not ready/);
  assert.equal(calls, 0);
  ready = true;
  const frame = await source.capture();
  assert.equal(calls, 1);
  frame.close();
});
