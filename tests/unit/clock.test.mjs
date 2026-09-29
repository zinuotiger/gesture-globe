import { test, expect, vi, afterEach } from 'vitest';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
test('normal epoch Performance time is preserved and missing API uses nondecreasing coarse fallback', async () => {
  vi.resetModules();
  const { monotonicNow } = await import('../../src/shared/clock.ts');
  vi.stubGlobal('performance', { timeOrigin: 1000, now: () => 10.25 });
  expect(monotonicNow()).toBe(1010.25);
  vi.stubGlobal('performance', undefined);
  const date = vi.spyOn(Date, 'now').mockReturnValue(1100);
  expect(monotonicNow()).toBe(1100);
  date.mockReturnValue(1050);
  expect(monotonicNow()).toBe(1100);
  date.mockReturnValue(NaN);
  expect(monotonicNow()).toBe(1100);
});
test('invalid or throwing Performance data cannot throw into scalar diagnostics', async () => {
  vi.resetModules();
  const { monotonicNow } = await import('../../src/shared/clock.ts');
  vi.spyOn(Date, 'now').mockReturnValue(2000);
  vi.stubGlobal('performance', { timeOrigin: NaN, now: () => 1 });
  expect(monotonicNow()).toBe(2000);
  vi.stubGlobal('performance', {
    timeOrigin: 0,
    now() {
      throw new Error('unavailable');
    },
  });
  expect(monotonicNow()).toBe(2000);
});
