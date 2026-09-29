import { test, expect } from 'vitest';
import { FrameScheduler } from '../../src/vision/index.ts';
test('virtual repeated slow settlements keep one slot and capture current input without linear backlog', async () => {
  const listeners = new Set();
  let current,
    captures = 0,
    closed = 0;
  const scheduler = new FrameScheduler({
    getState: () => ({ phase: 'READY' }),
    subscribe: () => () => {},
    onFrameSettled: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    submit: (frame) => {
      current = frame;
      frame.bitmap.close();
      return true;
    },
  });
  scheduler.start({
    isReady: () => true,
    capture: async () => {
      captures++;
      return {
        close() {
          closed++;
        },
      };
    },
  });
  const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };
  for (let cycle = 0; cycle < 2400; cycle++) {
    const start = cycle * 500;
    scheduler.tick(start);
    await flush();
    expect(current.captureTimeMs).toBe(start);
    expect(captures).toBe(cycle + 1);
    for (let offset = 10; offset < 500; offset += 10)
      scheduler.tick(start + offset);
    expect(scheduler.getMetrics().inFlight).toBe(1);
    expect(captures).toBe(cycle + 1);
    for (const listener of listeners) listener(current.frameId);
    expect(scheduler.getMetrics().inFlight).toBe(0);
  }
  expect(closed).toBe(2400);
  expect(scheduler.getMetrics().droppedBusy).toBe(2400 * 49);
  scheduler.dispose();
  expect(listeners.size).toBe(0);
});
