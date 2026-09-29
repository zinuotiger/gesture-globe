import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  VisionWorkerRuntime,
  VisionAssetError,
} from '../../src/vision/VisionWorkerRuntime.ts';
import { visionAssetUrls } from '../../src/config/index.ts';
const init = {
  type: 'INIT',
  schemaVersion: 1,
  sessionId: 'test',
  assets: visionAssetUrls(),
  options: { runningMode: 'VIDEO', numHands: 1, worldLandmarks: false },
};
test('worker sends READY only after resource load, rejects duplicates and disposes once', async () => {
  const messages = [];
  let resolve;
  let closes = 0;
  const runtime = new VisionWorkerRuntime(
    () => new Promise((r) => (resolve = r)),
    (m) => messages.push(m),
  );
  const loading = runtime.receive(init);
  assert.equal(messages.length, 0);
  await runtime.receive(init);
  assert.equal(messages.pop().error.code, 'E-VIS-006');
  resolve({
    close() {
      closes++;
    },
  });
  await loading;
  assert.equal(messages.pop().type, 'READY');
  await runtime.receive({ ...init, type: 'DISPOSE' });
  await runtime.receive({ ...init, type: 'DISPOSE' });
  assert.equal(closes, 1);
  assert.equal(messages.at(-1).type, 'DISPOSED');
});
test('dispose while initializing closes late resources without READY; failures are typed', async () => {
  const messages = [];
  let resolve;
  let closes = 0;
  const runtime = new VisionWorkerRuntime(
    () => new Promise((r) => (resolve = r)),
    (m) => messages.push(m),
  );
  const loading = runtime.receive(init);
  await runtime.receive({ ...init, type: 'DISPOSE' });
  resolve({
    close() {
      closes++;
    },
  });
  await loading;
  assert.equal(closes, 1);
  assert.deepEqual(
    messages.map((m) => m.type),
    ['DISPOSED'],
  );
  for (const code of ['E-VIS-001', 'E-VIS-002']) {
    const broken = new VisionWorkerRuntime(
      async () => {
        throw new VisionAssetError(code);
      },
      (m) => messages.push(m),
    );
    await broken.receive(init);
    assert.equal(messages.at(-1).error.code, code);
  }
});
