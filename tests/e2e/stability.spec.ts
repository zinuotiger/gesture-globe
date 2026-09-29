import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
declare global {
  interface Window {
    stabilityFixture: {
      report(): {
        instrumentationReads: number;
        report: {
          elapsedMs: number;
          samples: Record<string, unknown>[];
          collection: string;
          acceptance: string;
        } | null;
      };
      dispose(): void;
      observeNow(): void;
    };
    stabilityPermissions: number;
  }
}
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
});
test.afterAll(async () => {
  await fixture?.close();
});
test('short real-render instrumentation smoke remains incomplete and never activates media', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.stabilityPermissions = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => {
        window.stabilityPermissions++;
        return Promise.reject(
          new DOMException('No automatic activation', 'NotAllowedError'),
        );
      },
    });
  });
  await page.goto(fixture.origin + '/tests/fixtures/stability.html');
  expect(
    await page.evaluate(() => window.stabilityFixture.report().report),
  ).toBeNull();
  await page
    .getByRole('button', { name: '开始20分钟采集', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.stabilityFixture.report().report?.samples.length,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: '停止采集', exact: true }).click();
  await page.evaluate(() => {
    // Exercise the stopped callback deterministically, without sleeps or timing luck.
    for (let i = 0; i < 20; i++) window.stabilityFixture.observeNow();
  });
  const result = await page.evaluate(() => ({
    result: window.stabilityFixture.report().report,
    requests: window.stabilityPermissions,
    reads: window.stabilityFixture.report().instrumentationReads,
  }));
  expect(result.requests).toBe(0);
  expect(result.reads).toBe(result.result?.samples.length);
  expect(result.result?.collection).toBe('INCOMPLETE');
  expect(result.result?.acceptance).toBe('NOT_REVIEWED');
  expect(result.result?.elapsedMs).toBeLessThan(1200000);
  expect(result.result?.samples[1]?.renderFps).toBeGreaterThan(0);
  expect(Object.keys(result.result!.samples[0]!)).toEqual([
    'elapsedMs',
    'visible',
    'heapBytes',
    'renderFps',
    'inferenceP95',
    'latencyMax',
    'inFlight',
    'busyDrops',
    'errors',
  ]);
  expect(errors).toEqual([]);
  await page.evaluate(() => window.stabilityFixture.dispose());
});
