import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import {
  VisionWorkerClient,
  VisionHealthMonitor,
  decodeVisionRequest,
  decodeVisionResponse,
} from '../../src/vision/index.ts';
import { VisionWorkerRuntime } from '../../src/vision/VisionWorkerRuntime.ts';
import {
  defaults,
  visionAssetUrls,
  parseConfig,
} from '../../src/config/index.ts';
class Port {
  onmessage = null;
  onerror = null;
  sent = [];
  terminated = 0;
  postMessage(m) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated++;
  }
  emit(m) {
    this.onmessage?.({ data: { schemaVersion: 1, sessionId: 's', ...m } });
  }
  ready() {
    this.emit({ type: 'READY', modelVersion: 'synthetic' });
  }
  error(code = 'E-VIS-001', frameId) {
    this.emit({
      type: 'ERROR',
      ...(frameId === undefined ? {} : { frameId }),
      error: {
        schemaVersion: 1,
        id: 'fixture',
        code,
        module: 'M04',
        severity: 'ERROR',
        recoverable: true,
        retryPolicy: 'USER',
        messageKey: 'fixture',
        atMs: 0,
      },
    });
  }
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
function fixture() {
  let time = 1000;
  const ports = [];
  const client = new VisionWorkerClient(
    defaults,
    () => {
      const p = new Port();
      ports.push(p);
      return p;
    },
    () => time,
  );
  const monitor = new VisionHealthMonitor(client, defaults, () => time);
  return {
    client,
    monitor,
    ports,
    setTime: (t) => {
      time = t;
    },
    dispose: () => {
      monitor.dispose();
      client.dispose();
    },
  };
}
test('crash restarts exactly once, a second failure degrades and never storms; explicit activation resets budget', async () => {
  const f = fixture();
  try {
    const start = f.monitor.start({ sessionId: 's' });
    assert.equal(f.monitor.start({ sessionId: 's' }), start);
    f.ports[0].ready();
    await start;
    const obsolete = f.ports[0].onerror;
    f.ports[0].onerror({});
    await flush();
    assert.equal(f.monitor.getState().phase, 'RESTARTING');
    assert.equal(f.ports.length, 2);
    f.ports[1].ready();
    await flush();
    assert.equal(f.monitor.getState().phase, 'HEALTHY');
    obsolete({});
    await flush();
    assert.equal(f.ports.length, 2);
    f.ports[1].onerror({});
    await flush();
    assert.equal(f.monitor.getState().phase, 'DEGRADED');
    for (let i = 0; i < 100; i++) f.monitor.tick();
    assert.equal(f.ports.length, 2);
    assert.equal(f.ports[1].terminated, 1);
    const retry = f.monitor.start({ sessionId: 's' });
    f.ports[2].ready();
    await retry;
    assert.equal(f.monitor.getState().restarts, 0);
  } finally {
    f.dispose();
  }
});
test('heartbeat checks matching nonce; pause suppresses probes; timeout recovery is bounded and stop clears timers', async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    const start = f.monitor.start({ sessionId: 's' });
    f.ports[0].ready();
    await start;
    f.monitor.tick();
    const ping = f.ports[0].sent.at(-1);
    assert.equal(ping.type, 'PING');
    f.ports[0].emit({ type: 'PONG', nonce: ping.nonce + 1 });
    f.setTime(4000);
    f.monitor.tick();
    assert.equal(f.ports.length, 2);
    f.ports[1].ready();
    await flush();
    f.monitor.pause();
    const count = f.ports[1].sent.length;
    f.setTime(20000);
    f.monitor.tick();
    assert.equal(f.ports[1].sent.length, count);
    f.ports[1].emit({ type: 'PAUSED' });
    f.monitor.resume();
    f.ports[1].ready();
    f.monitor.tick();
    const valid = f.ports[1].sent.at(-1);
    f.ports[1].emit({ type: 'PONG', nonce: valid.nonce });
    f.setTime(23000);
    f.monitor.tick();
    assert.equal(f.monitor.getState().phase, 'HEALTHY');
    f.setTime(26000);
    f.monitor.tick();
    assert.equal(f.monitor.getState().phase, 'DEGRADED');
    assert.equal(f.ports.length, 2);
    assert.equal(vi.getTimerCount(), 0);
    f.monitor.stop();
    assert.equal(vi.getTimerCount(), 0);
  } finally {
    f.dispose();
    vi.useRealTimers();
  }
});
test('model load gets one retry, schema errors and initialization timeout do not; cancellation cannot revive worker', async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    const start = f.monitor.start({ sessionId: 's' });
    f.ports[0].error();
    await flush();
    assert.equal(f.ports.length, 2);
    f.ports[1].ready();
    assert.equal((await start).ok, true);
    f.ports[1].error('E-VIS-006');
    await flush();
    assert.equal(f.monitor.getState().phase, 'DEGRADED');
    const timeout = f.monitor.start({ sessionId: 's' });
    await vi.advanceTimersByTimeAsync(defaults.vision.initTimeoutMs);
    assert.equal((await timeout).ok, false);
    assert.equal(f.ports.length, 3);
    const cancelled = f.monitor.start({ sessionId: 's' });
    const late = f.ports[3].onmessage;
    f.monitor.stop();
    assert.equal((await cancelled).ok, false);
    late({
      data: {
        type: 'READY',
        schemaVersion: 1,
        sessionId: 's',
        modelVersion: 'late',
      },
    });
    await flush();
    assert.equal(f.monitor.getState().phase, 'STOPPED');
    assert.equal(vi.getTimerCount(), 0);
  } finally {
    f.dispose();
    vi.useRealTimers();
  }
});
test('three consecutive inference failures stop worker, single failures settle slot, success resets count', async () => {
  const f = fixture();
  const settled = [];
  f.client.onFrameSettled((id) => settled.push(id));
  try {
    const start = f.monitor.start({ sessionId: 's' });
    const p = f.ports[0];
    p.ready();
    await start;
    p.error('E-VIS-004', 0);
    p.error('E-VIS-004', 1);
    assert.equal(f.client.getState().phase, 'READY');
    p.emit({
      type: 'FRAME_RESULT',
      frame: {
        schemaVersion: 1,
        sessionId: 's',
        frameId: 2,
        captureTimeMs: 999,
        resultTimeMs: 1000,
        inferenceMs: 1,
        source: { width: 4, height: 4 },
        hands: [],
      },
    });
    assert.deepEqual(f.monitor.getMetrics(), {
      count: 1,
      meanInferenceMs: 1,
      maxInferenceMs: 1,
    });
    p.error('E-VIS-004', 3);
    p.error('E-VIS-004', 4);
    assert.equal(f.client.getState().phase, 'READY');
    p.error('E-VIS-004', 5);
    await flush();
    assert.equal(f.monitor.getState().phase, 'DEGRADED');
    assert.equal(f.ports.length, 1);
    assert.deepEqual(settled, [0, 1, 2, 3, 4, 5]);
  } finally {
    f.dispose();
  }
});
test('actual runtime responds with the exact probe nonce and rejects invalid heartbeat metadata', async () => {
  const sent = [];
  const runtime = new VisionWorkerRuntime(
    async () => ({ close() {} }),
    (m) => sent.push(m),
  );
  const meta = { schemaVersion: 1, sessionId: 's' };
  await runtime.receive({
    ...meta,
    type: 'INIT',
    assets: visionAssetUrls(),
    options: { runningMode: 'VIDEO', numHands: 1, worldLandmarks: false },
  });
  await runtime.receive({ ...meta, type: 'PING', nonce: 42 });
  assert.deepEqual(sent.at(-1), { ...meta, type: 'PONG', nonce: 42 });
  for (const nonce of [-1, NaN, Infinity, 1.2, '42']) {
    assert.equal(
      decodeVisionRequest({ ...meta, type: 'PING', nonce }).ok,
      false,
    );
    assert.equal(
      decodeVisionResponse({ ...meta, type: 'PONG', nonce }).ok,
      false,
    );
  }
  await runtime.receive({ ...meta, type: 'DISPOSE' });
});
test('health thresholds are validated and cannot lower the three-error stop rule', () => {
  assert.throws(() => parseConfig({ vision: { maxConsecutiveErrors: 2 } }));
  assert.throws(() =>
    parseConfig({
      vision: { heartbeatIntervalMs: 2000, heartbeatTimeoutMs: 1000 },
    }),
  );
  assert.equal(parseConfig().vision.maxConsecutiveErrors, 3);
});

test('synchronous stop from a state observer cannot create a late heartbeat timer', async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    f.monitor.subscribe((state) => {
      if (state.phase === 'HEALTHY') f.monitor.stop();
    });
    const start = f.monitor.start({ sessionId: 's' });
    f.ports[0].ready();
    assert.equal((await start).ok, false);
    assert.equal(f.monitor.getState().phase, 'STOPPED');
    assert.equal(vi.getTimerCount(), 0);
  } finally {
    f.dispose();
    vi.useRealTimers();
  }
});

test('synchronous stop before connection does not allocate a worker', async () => {
  const f = fixture();
  try {
    f.monitor.subscribe((state) => {
      if (state.phase === 'STARTING') f.monitor.stop();
    });
    assert.equal((await f.monitor.start({ sessionId: 's' })).ok, false);
    assert.equal(f.ports.length, 0);
    assert.equal(f.monitor.getState().phase, 'STOPPED');
  } finally {
    f.dispose();
  }
});
