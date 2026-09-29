import { test, expect } from 'vitest';
import { PerformanceGovernor } from '../../src/app/PerformanceGovernor.ts';
import { FrameScheduler } from '../../src/vision/index.ts';
import { defaults } from '../../src/config/index.ts';
test('adaptive rates drive the real single-slot scheduler without restarting its source or queuing frames', async () => {
  const governor = new PerformanceGovernor(defaults),
    listeners = new Set();
  let submitted = 0,
    latest,
    captures = 0;
  const client = {
    getState: () => ({ phase: 'READY' }),
    subscribe: (fn) => {
      fn({ phase: 'READY' });
      return () => {};
    },
    onFrameSettled: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    submit: (frame) => {
      submitted++;
      latest = frame.frameId;
      frame.bitmap.close();
      return true;
    },
  };
  const scheduler = new FrameScheduler(client);
  scheduler.start({
    isReady: () => true,
    capture: async () => {
      captures++;
      return { close() {} };
    },
  });
  const observation = {
    visible: true,
    inferenceActive: true,
    renderFps: 20,
    inferenceP95: 200,
    latencyP95: 250,
    alerts: ['LOW_RENDER'],
  };
  const tick = async (t) => {
    scheduler.tick(t);
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };
  const acknowledge = () => {
    for (const listener of listeners) listener(latest);
  };
  scheduler.setTargetHz(governor.observe({ ...observation, atMs: 0 }).targetHz);
  for (let t = 0; t < 1000; t++) {
    await tick(t);
    acknowledge();
  }
  expect(submitted).toBe(20);
  scheduler.setTargetHz(
    governor.observe({ ...observation, atMs: 5000 }).targetHz,
  );
  const before = submitted;
  for (let t = 5000; t < 6000; t++) {
    await tick(t);
    acknowledge();
  }
  expect(submitted - before).toBe(15);
  await tick(6100);
  const busy = captures;
  for (let t = 6101; t < 7100; t++) await tick(t);
  expect(captures).toBe(busy);
  expect(scheduler.getMetrics().inFlight).toBe(1);
  acknowledge();
  await tick(7100);
  expect(captures).toBe(busy + 1);
  scheduler.dispose();
});
