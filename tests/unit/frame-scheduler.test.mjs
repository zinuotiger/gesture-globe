import assert from 'node:assert/strict';
import { test } from 'vitest';
import { FrameScheduler } from '../../src/vision/index.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';
const flush = async () => {
  for (let n = 0; n < 6; n++) await Promise.resolve();
};
function fixture() {
  const frames = new Set(),
    states = new Set();
  let phase = 'READY';
  const submitted = [];
  const client = {
    getState: () => ({ phase }),
    onFrameSettled: (fn) => {
      frames.add(fn);
      return () => frames.delete(fn);
    },
    subscribe: (fn) => {
      states.add(fn);
      fn({ phase });
      return () => states.delete(fn);
    },
    submit: (frame) => {
      submitted.push(frame);
      return true;
    },
  };
  return {
    client,
    submitted,
    frames,
    states,
    ack: (id) => {
      for (const fn of frames) fn(id);
    },
    phase: (value) => {
      phase = value;
      for (const fn of states) fn({ phase });
    },
  };
}
test('restoring a schema-valid fractional startup rate is allowed without permitting arbitrary fractional runtime rates', () => {
  const f = fixture();
  const scheduler = new FrameScheduler(
    f.client,
    parseConfig({ vision: { targetHz: 24.5 } }),
  );
  scheduler.setTargetHz(15);
  scheduler.setTargetHz(24.5);
  assert.equal(scheduler.getMetrics().targetHz, 24.5);
  assert.throws(() => scheduler.setTargetHz(23.5), RangeError);
  scheduler.dispose();
});
test('slow capture/inference never queues; only latest available tick after matching completion is captured', async () => {
  const f = fixture();
  let resolve;
  let calls = 0;
  const scheduler = new FrameScheduler(f.client);
  scheduler.start({
    isReady: () => true,
    capture: () => {
      calls++;
      return new Promise((r) => (resolve = r));
    },
  });
  scheduler.tick(0);
  await flush();
  for (let n = 1; n < 1000; n++) scheduler.tick(n);
  assert.equal(calls, 1);
  assert.equal(scheduler.getMetrics().inFlight, 1);
  resolve({ close() {} });
  await flush();
  assert.equal(f.submitted.length, 1);
  scheduler.tick(1000);
  f.ack(999);
  scheduler.tick(1001);
  assert.equal(calls, 1);
  f.ack(f.submitted[0].frameId);
  scheduler.tick(1002);
  await flush();
  assert.equal(calls, 2);
  resolve({ close() {} });
  await flush();
  assert.equal(f.submitted[1].captureTimeMs, 1002);
  assert.equal(scheduler.getMetrics().droppedBusy, 1001);
  f.ack(f.submitted[1].frameId);
  scheduler.dispose();
});
test('target rate is bounded by validated configuration; invalid clocks and unavailable sources do not capture', async () => {
  const f = fixture();
  const scheduler = new FrameScheduler(f.client);
  let calls = 0;
  scheduler.start({
    isReady: () => true,
    capture: async () => {
      calls++;
      return { close() {} };
    },
  });
  for (let t = 0; t <= 1000; t++) {
    scheduler.tick(t);
    await flush();
    if (f.submitted.length) f.ack(f.submitted.at(-1).frameId);
  }
  assert.equal(calls, 24);
  assert.equal(scheduler.getMetrics().targetHz, defaults.vision.targetHz);
  for (const invalid of [0, 14, 31, NaN, Infinity, 24.5])
    assert.throws(() => scheduler.setTargetHz(invalid), RangeError);
  scheduler.setTargetHz(15);
  assert.equal(scheduler.getMetrics().targetHz, 15);
  scheduler.tick(NaN);
  scheduler.tick(10);
  assert.equal(scheduler.getMetrics().invalidClock, 2);
  f.phase('INITIALIZING');
  scheduler.tick(2000);
  assert.equal(calls, 24);
  scheduler.dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.states.size, 0);
});
test('stop/restart retains one unresolved capture slot and closes the obsolete bitmap', async () => {
  const f = fixture();
  const scheduler = new FrameScheduler(f.client);
  let resolve;
  let captures = 0;
  let closed = 0;
  const source = {
    isReady: () => true,
    capture: () => {
      captures++;
      return new Promise((r) => (resolve = r));
    },
  };
  scheduler.start(source);
  scheduler.tick(0);
  await flush();
  for (let n = 0; n < 100; n++) {
    scheduler.stop();
    scheduler.start(source);
    scheduler.tick(n + 1);
  }
  assert.equal(captures, 1);
  resolve({
    close() {
      closed++;
    },
  });
  await flush();
  assert.equal(closed, 1);
  assert.equal(f.submitted.length, 0);
  assert.equal(scheduler.getMetrics().inFlight, 0);
  scheduler.dispose();
});
test('capture rejection releases the slot; client owns rejection cleanup; non-ready sessions invalidate captured frames', async () => {
  const f = fixture();
  let closed = 0;
  const scheduler = new FrameScheduler(f.client);
  scheduler.start({
    isReady: () => true,
    capture: async () => {
      throw new Error('synthetic capture fault');
    },
  });
  scheduler.tick(0);
  await flush();
  assert.equal(scheduler.getMetrics().captureErrors, 1);
  assert.equal(scheduler.getMetrics().inFlight, 0);
  f.client.submit = (frame) => {
    frame.bitmap.close();
    return false;
  };
  scheduler.start({
    isReady: () => true,
    capture: async () => ({
      close() {
        closed++;
      },
    }),
  });
  scheduler.tick(100);
  await flush();
  assert.equal(closed, 1);
  assert.equal(scheduler.getMetrics().transferErrors, 1);
  let finishCapture;
  scheduler.start({
    isReady: () => true,
    capture: () =>
      new Promise((resolve) => {
        finishCapture = resolve;
      }),
  });
  scheduler.tick(200);
  await flush();
  f.phase('INITIALIZING');
  f.phase('READY');
  finishCapture({
    close() {
      closed++;
    },
  });
  await flush();
  assert.equal(closed, 2);
  assert.equal(scheduler.getMetrics().droppedCancelled, 1);
  scheduler.dispose();
});
