import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import {
  MockVisionClient,
  parseVisionFixture,
} from '../../src/vision/MockVisionClient.ts';
import { FrameScheduler } from '../../src/vision/index.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';
import { visionSequence } from '../fixtures/vision-sequences.mjs';
const config = parseConfig({ features: { mockVision: true } }, 'test');
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
class SyntheticBitmap {
  width = 640;
  height = 480;
  closes = 0;
  close() {
    this.closes++;
  }
}
test('fixture schema/provenance and nonproduction opt-in are mandatory; caller cannot mutate replay data', () => {
  const fixture = visionSequence();
  const clone = parseVisionFixture(fixture);
  fixture.frames[0].hands[0].landmarks[0].x = 99;
  assert.equal(clone.frames[0].hands[0].landmarks[0].x, 0.3);
  for (const invalid of [
    null,
    {},
    { ...fixture, source: 'camera' },
    { ...fixture, schemaVersion: 2 },
    { ...fixture, frames: [] },
    { ...fixture, frames: [{}] },
  ])
    assert.throws(() => parseVisionFixture(invalid));
  assert.throws(
    () => new MockVisionClient(clone, defaults, () => 0),
    /test flag/,
  );
  vi.stubEnv('PROD', true);
  try {
    assert.throws(
      () => new MockVisionClient(clone, config, () => 0),
      /test flag/,
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
test('deterministic client replay uses the real protocol, pause/resume and bitmap ownership with no camera/model/network', async () => {
  vi.stubGlobal('ImageBitmap', SyntheticBitmap);
  vi.stubGlobal('fetch', () => {
    throw new Error('Network forbidden in replay');
  });
  try {
    const run = async () => {
      let now = 1000;
      const frames = [];
      const client = new MockVisionClient(visionSequence(), config, () => now);
      client.onFrame((f) => frames.push(f));
      assert.equal(client.mode, 'SYNTHETIC_REPLAY');
      assert.equal((await client.start({ sessionId: 'replay' })).ok, true);
      for (let i = 0; i < 3; i++) {
        const bitmap = new SyntheticBitmap();
        assert.equal(
          client.submit({ frameId: i, captureTimeMs: now, bitmap }),
          true,
        );
        await flush();
        now += 10;
        assert.equal(client.completeNext(), true);
        await flush();
        assert.equal(bitmap.closes, 1);
        client.pause('test');
        client.resume();
        await flush();
        assert.equal(client.getState().phase, 'READY');
        now += 40;
      }
      assert.equal(client.getReplayMetrics().pending, 0);
      assert.equal(client.getReplayMetrics().maximumActive, 1);
      client.dispose();
      return frames;
    };
    const first = await run();
    assert.deepEqual(await run(), first);
    assert.deepEqual(
      first.map((f) => f.frameId),
      [0, 1, 2],
    );
    assert.equal(first[0].sessionId, 'replay');
    assert.equal(first[0].hands[0].gestures[0].name, 'Open_Palm');
  } finally {
    vi.unstubAllGlobals();
  }
});
test('slow inference keeps one frame and constant simulated latency over 1000 cycles; stale work never accumulates', async () => {
  vi.stubGlobal('ImageBitmap', SyntheticBitmap);
  let now = 1000;
  const client = new MockVisionClient(visionSequence(1000), config, () => now);
  const scheduler = new FrameScheduler(client, config, () => now);
  const bitmaps = [];
  let delivered = 0;
  client.onFrame(() => delivered++);
  try {
    await client.start({ sessionId: 'slow-synthetic' });
    scheduler.start({
      isReady: () => true,
      capture: async () => {
        const b = new SyntheticBitmap();
        bitmaps.push(b);
        return b;
      },
    });
    for (let i = 0; i < 1000; i++) {
      scheduler.tick();
      await flush();
      assert.equal(client.getReplayMetrics().pending, 1);
      const captured = now;
      for (let tick = 0; tick < 20; tick++) {
        now += 10;
        scheduler.tick();
      }
      client.completeNext();
      await flush();
      assert.equal(now - captured, 200);
      assert.equal(scheduler.getMetrics().inFlight, 0);
    }
    assert.equal(delivered, 0);
    assert.equal(client.getDropMetrics().stale, 1000);
    assert.equal(scheduler.getMetrics().submitted, 1000);
    assert.equal(scheduler.getMetrics().droppedBusy, 20000);
    assert.equal(client.getReplayMetrics().maximumActive, 1);
    assert.ok(bitmaps.every((b) => b.closes === 1));
  } finally {
    scheduler.dispose();
    client.dispose();
    vi.unstubAllGlobals();
  }
});
test('synthetic failure and disposal release bitmap without persisting a partial replay or hanging the scheduler', async () => {
  vi.stubGlobal('ImageBitmap', SyntheticBitmap);
  const client = new MockVisionClient(visionSequence(), config, () => 1000);
  try {
    await client.start({ sessionId: 'fault' });
    const first = new SyntheticBitmap();
    client.submit({ frameId: 0, captureTimeMs: 1000, bitmap: first });
    await flush();
    client.completeNext(true);
    await flush();
    assert.equal(first.closes, 1);
    assert.equal(client.getState().phase, 'READY');
    const second = new SyntheticBitmap();
    client.submit({ frameId: 1, captureTimeMs: 1000, bitmap: second });
    await flush();
    client.dispose();
    await flush();
    assert.equal(second.closes, 1);
    assert.equal(client.completeNext(), false);
    assert.equal(client.getReplayMetrics().active, 0);
  } finally {
    client.dispose();
    vi.unstubAllGlobals();
  }
});
