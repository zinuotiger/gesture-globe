import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { VisionWorkerClient, FrameScheduler } from '../../src/vision/index.ts';
import { VisionWorkerRuntime } from '../../src/vision/VisionWorkerRuntime.ts';
import { defaults, visionAssetUrls } from '../../src/config/index.ts';
import { bindVisionActivity } from '../../src/app/bindVisionActivity.ts';
class Bitmap {
  width = 4;
  height = 4;
  closes = 0;
  close() {
    this.closes++;
  }
}
class Port {
  onmessage = null;
  onerror = null;
  sent = [];
  postMessage(message) {
    this.sent.push(message);
  }
  terminate() {}
  emit(message) {
    this.onmessage?.({
      data: { schemaVersion: 1, sessionId: 's', ...message },
    });
  }
}
const frame = (id, capture = 1000) => ({
  schemaVersion: 1,
  sessionId: 's',
  frameId: id,
  captureTimeMs: capture,
  resultTimeMs: capture + 1,
  inferenceMs: 1,
  source: { width: 4, height: 4 },
  hands: [],
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
async function fixture() {
  const port = new Port();
  const client = new VisionWorkerClient(
    defaults,
    () => port,
    () => 1100,
  );
  const ready = client.start({ sessionId: 's' });
  port.emit({ type: 'READY', modelVersion: 'synthetic' });
  await ready;
  return { port, client };
}
test('stale, duplicate, older and future-clock frames never reach consumers; settled still releases scheduling', async () => {
  vi.stubGlobal('ImageBitmap', Bitmap);
  try {
    const { port, client } = await fixture();
    const applied = [],
      settled = [];
    client.onFrame((f) => applied.push(f.frameId));
    client.onFrameSettled((id) => settled.push(id));
    const scheduler = new FrameScheduler(client);
    scheduler.start({ isReady: () => true, capture: async () => new Bitmap() });
    scheduler.tick(0);
    await flush();
    assert.equal(scheduler.getMetrics().inFlight, 1);
    port.emit({ type: 'FRAME_RESULT', frame: frame(0, 0) });
    assert.equal(scheduler.getMetrics().inFlight, 0);
    for (const f of [
      frame(2),
      frame(1),
      frame(2),
      frame(3, 1101),
      frame(4, 950),
    ])
      port.emit({ type: 'FRAME_RESULT', frame: f });
    assert.deepEqual(applied, [2, 4]); // exactly 150ms is accepted
    assert.deepEqual(settled, [0, 2, 1, 2, 3, 4]);
    assert.deepEqual(client.getDropMetrics(), {
      stale: 1,
      order: 2,
      paused: 0,
      clock: 1,
    });
    scheduler.dispose();
    client.dispose();
  } finally {
    vi.unstubAllGlobals();
  }
});
test('pause cancels pending delivery immediately; early resume waits for worker acknowledgement and rejects old results', async () => {
  vi.stubGlobal('ImageBitmap', Bitmap);
  try {
    const { port, client } = await fixture();
    const applied = [];
    client.onFrame((f) => applied.push(f.frameId));
    client.submit({ frameId: 10, captureTimeMs: 1000, bitmap: new Bitmap() });
    assert.equal(client.pause('PAGE_HIDDEN'), true);
    assert.equal(client.getState().phase, 'PAUSED');
    assert.equal(client.resume(), true);
    assert.equal(port.sent.at(-1).type, 'PAUSE');
    port.emit({ type: 'FRAME_RESULT', frame: frame(10) });
    assert.equal(applied.length, 0);
    port.emit({ type: 'PAUSED' });
    assert.equal(port.sent.at(-1).type, 'RESUME');
    assert.equal(client.getState().phase, 'RESUMING');
    port.emit({ type: 'READY', modelVersion: 'synthetic' });
    port.emit({ type: 'FRAME_RESULT', frame: frame(10) });
    port.emit({ type: 'FRAME_RESULT', frame: frame(11) });
    assert.deepEqual(applied, [11]);
    client.dispose();
  } finally {
    vi.unstubAllGlobals();
  }
});
test('worker pauses without processing new images, closes in-flight image before acknowledgement, resumes without old result', async () => {
  vi.stubGlobal('ImageBitmap', Bitmap);
  try {
    const sent = [];
    let finish;
    let calls = 0;
    const runtime = new VisionWorkerRuntime(
      async () => ({
        close() {},
        processFrame: () => {
          calls++;
          return new Promise((r) => {
            finish = r;
          });
        },
      }),
      (m) => sent.push(m),
    );
    const meta = { schemaVersion: 1, sessionId: 's' };
    await runtime.receive({
      ...meta,
      type: 'INIT',
      assets: visionAssetUrls(),
      options: { runningMode: 'VIDEO', numHands: 1, worldLandmarks: false },
    });
    const bitmap = new Bitmap();
    const pending = runtime.receive({
      ...meta,
      type: 'PROCESS_FRAME',
      frameId: 0,
      captureTimeMs: 1000,
      bitmap,
    });
    await runtime.receive({ ...meta, type: 'PAUSE', reason: 'hidden' });
    assert.equal(sent.filter((m) => m.type === 'PAUSED').length, 0);
    const rejected = new Bitmap();
    await runtime.receive({
      ...meta,
      type: 'PROCESS_FRAME',
      frameId: 1,
      captureTimeMs: 1001,
      bitmap: rejected,
    });
    assert.equal(rejected.closes, 1);
    assert.equal(calls, 1);
    finish(frame(0));
    await pending;
    assert.equal(bitmap.closes, 1);
    assert.equal(sent.at(-1).type, 'PAUSED');
    assert.equal(sent.filter((m) => m.type === 'FRAME_RESULT').length, 0);
    await runtime.receive({ ...meta, type: 'RESUME' });
    assert.equal(sent.at(-1).type, 'READY');
    const next = new Bitmap();
    const work = runtime.receive({
      ...meta,
      type: 'PROCESS_FRAME',
      frameId: 2,
      captureTimeMs: 1002,
      bitmap: next,
    });
    finish(frame(2));
    await work;
    assert.equal(sent.at(-1).frame.frameId, 2);
    assert.equal(next.closes, 1);
    await runtime.receive({ ...meta, type: 'DISPOSE' });
  } finally {
    vi.unstubAllGlobals();
  }
});
test('App visibility and gesture-off boundary pauses ready clients and removes listener on dispose', async () => {
  const { port, client } = await fixture();
  const listeners = new Set();
  const visibility = {
    hidden: true,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  const binding = bindVisionActivity(client, visibility);
  assert.equal(client.getState().phase, 'PAUSED');
  port.emit({ type: 'PAUSED' });
  visibility.hidden = false;
  for (const fn of listeners) fn();
  port.emit({ type: 'READY', modelVersion: 'synthetic' });
  assert.equal(client.getState().phase, 'READY');
  binding.setEnabled(false);
  assert.equal(client.getState().phase, 'PAUSED');
  binding.dispose();
  assert.equal(listeners.size, 0);
  client.dispose();
});
