import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
import type { MetricCollector } from '../../src/diagnostics/index.ts';
declare global {
  interface Window {
    metricsFixture: {
      snapshot(): ReturnType<MetricCollector['snapshot']>;
      dispose(): void;
    };
  }
}
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
});
test.afterAll(async () => {
  await fixture?.close();
});
test('actual render and local model observations produce bounded scalar statistics; close/dispose clear inference', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const c = document.createElement('canvas');
        c.width = 160;
        c.height = 90;
        c.getContext('2d')!.fillRect(0, 0, 160, 90);
        return c.captureStream(1);
      },
    }),
  );
  await page.goto(fixture.origin + '/tests/fixtures/metrics.html');
  await expect
    .poll(() =>
      page.evaluate(() => window.metricsFixture.snapshot().render.count),
    )
    .toBeGreaterThan(1);
  const before = await page.evaluate(() => window.metricsFixture.snapshot());
  expect(before.renderFps).toBeGreaterThan(0);
  expect(before.inferenceFps).toBeNull();
  expect(before.inference.count).toBe(0);
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.gesture-feedback')).toHaveAttribute(
    'data-phase',
    'READY',
    { timeout: 15000 },
  );
  await expect
    .poll(
      () =>
        page.evaluate(() => window.metricsFixture.snapshot().inference.count),
      { timeout: 10000 },
    )
    .toBeGreaterThan(1);
  const active = await page.evaluate(() => window.metricsFixture.snapshot());
  expect(active.inferenceFps).toBeGreaterThan(0);
  expect(active.inference.p95).toBeGreaterThanOrEqual(0);
  expect(active.drops.submitted).toBeGreaterThan(0);
  expect(active.render.count).toBeLessThanOrEqual(600);
  expect(JSON.stringify(active)).not.toMatch(
    /landmarks|bitmap|deviceId|frameId/,
  );
  await page.getByRole('button', { name: '关闭摄像头', exact: true }).click();
  expect(
    await page.evaluate(() => window.metricsFixture.snapshot().inference.count),
  ).toBe(0);
  await page.evaluate(() => window.metricsFixture.dispose());
  expect(
    await page.evaluate(() => window.metricsFixture.snapshot().renderFps),
  ).toBeNull();
  expect(errors).toEqual([]);
});
