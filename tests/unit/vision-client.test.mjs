import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { VisionWorkerClient } from '../../src/vision/index.ts';
import { defaults } from '../../src/config/index.ts';
class FakePort {
  onmessage = null;
  onerror = null;
  messages = [];
  terminated = 0;
  postMessage(message, transfer) {
    this.messages.push({ message, transfer });
  }
  terminate() {
    this.terminated++;
  }
  emit(data) {
    this.onmessage?.({ data });
  }
}
const ready = (sessionId) => ({
  type: 'READY',
  schemaVersion: 1,
  sessionId,
  modelVersion: 'test-fixture',
});
const result = (sessionId) => ({
  type: 'FRAME_RESULT',
  schemaVersion: 1,
  sessionId,
  frame: {
    schemaVersion: 1,
    sessionId,
    frameId: 1,
    captureTimeMs: 1,
    resultTimeMs: 2,
    inferenceMs: 1,
    source: { width: 10, height: 10 },
    hands: [],
  },
});
test('READY gates activation, duplicate start shares pending, and late session messages are discarded', async () => {
  const ports = [];
  const frames = [];
  const client = new VisionWorkerClient(
    defaults,
    () => {
      const p = new FakePort();
      ports.push(p);
      return p;
    },
    () => 5,
  );
  client.onFrame((f) => frames.push(f));
  const first = client.start({ sessionId: 'a' });
  assert.equal(client.start({ sessionId: 'a' }), first);
  const stale = ports[0].onmessage;
  ports[0].emit(ready('old'));
  assert.equal(client.getState().phase, 'INITIALIZING');
  ports[0].emit(ready('a'));
  assert.equal((await first).ok, true);
  assert.equal((await client.start({ sessionId: 'a' })).ok, true);
  assert.equal(ports.length, 1);
  const second = client.start({ sessionId: 'b' });
  stale({ data: result('a') });
  ports[1].emit(result('a'));
  assert.equal(frames.length, 0);
  ports[1].emit(ready('b'));
  await second;
  ports[1].emit(result('b'));
  assert.equal(frames.length, 1);
  client.dispose();
  client.dispose();
  assert.equal(ports[0].terminated, 1);
  assert.equal(ports[1].terminated, 1);
  assert.equal(client.getState().phase, 'DISPOSED');
  assert.equal((await client.start({ sessionId: 'c' })).ok, false);
});
test('cancelled initialization resolves, detaches listeners and ignores captured late READY', async () => {
  const port = new FakePort();
  const client = new VisionWorkerClient(defaults, () => port);
  const pending = client.start({ sessionId: 'cancel' });
  const callback = port.onmessage;
  client.stop();
  client.stop();
  assert.equal((await pending).ok, false);
  callback({ data: ready('cancel') });
  assert.equal(client.getState().phase, 'IDLE');
  assert.equal(port.onmessage, null);
  assert.equal(port.terminated, 1);
});
test('initialization timeout, crash and unknown version fail without an automatic restart', async () => {
  vi.useFakeTimers();
  try {
    const ports = [];
    const client = new VisionWorkerClient(defaults, () => {
      const p = new FakePort();
      ports.push(p);
      return p;
    });
    const timed = client.start({ sessionId: 'timeout' });
    await vi.advanceTimersByTimeAsync(defaults.vision.initTimeoutMs);
    assert.equal((await timed).error.technical.name, 'INIT_TIMEOUT');
    assert.equal(ports.length, 1);
    const crashed = client.start({ sessionId: 'crash' });
    ports[1].onerror({});
    assert.equal((await crashed).error.code, 'E-VIS-003');
    const invalid = client.start({ sessionId: 'version' });
    ports[2].emit({ ...ready('version'), schemaVersion: 2 });
    assert.equal((await invalid).error.code, 'E-VIS-006');
    assert.equal(vi.getTimerCount(), 0);
    client.dispose();
  } finally {
    vi.useRealTimers();
  }
});
test('pre-READY bitmap is closed locally and never posted', () => {
  let closed = 0;
  const client = new VisionWorkerClient(defaults, () => new FakePort());
  assert.equal(
    client.submit({
      frameId: 0,
      captureTimeMs: 0,
      bitmap: {
        close() {
          closed++;
        },
      },
    }),
    false,
  );
  assert.equal(closed, 1);
  client.dispose();
});
