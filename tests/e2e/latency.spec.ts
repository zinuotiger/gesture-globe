import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
import type { LatencyTracer } from '../../src/diagnostics/index.ts';
declare global {
  interface Window {
    latencyFixture: {
      snapshot(): ReturnType<LatencyTracer['snapshot']>;
      feed(): { accepted: boolean };
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
test('synthetic input completes only after real WebGL render submission and exposes no video data', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(fixture.origin + '/tests/fixtures/latency.html');
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  const immediate = await page.evaluate(() => ({
    result: window.latencyFixture.feed(),
    sample: window.latencyFixture.snapshot(),
  }));
  expect(immediate.result.accepted).toBe(true);
  expect(immediate.sample.captureToRender.count).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.latencyFixture.snapshot().captureToRender.count,
      ),
    )
    .toBe(1);
  const result = await page.evaluate(() => window.latencyFixture.snapshot());
  expect(result.last!.renderMs).toBeGreaterThanOrEqual(result.last!.commandMs);
  expect(result.last!.commandMs).toBeGreaterThanOrEqual(result.last!.intentMs);
  expect(result.last!.traceId).toBe('input:gesture:synthetic-start');
  expect(JSON.stringify(result)).not.toMatch(
    /landmarks|bitmap|deviceId|frameId/,
  );
  await page.evaluate(() => window.latencyFixture.dispose());
  expect(
    await page.evaluate(
      () => window.latencyFixture.snapshot().captureToRender.count,
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
});
