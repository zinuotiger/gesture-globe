import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
import type { mountRuntime } from '../../src/app/mountRuntime.ts';
declare global {
  interface Window {
    diagnosticsFixture: {
      snapshot(): ReturnType<ReturnType<typeof mountRuntime>['getDiagnostics']>;
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
test('diagnostics require explicit open, bound refresh, show scalar observations, clear events and return focus', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(fixture.origin + '/tests/fixtures/diagnostics.html');
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  expect(
    await page.evaluate(() => window.diagnosticsFixture.snapshot()!.updates),
  ).toBe(0);
  await page.getByRole('button', { name: '向左旋转', exact: true }).click();
  await page.locator('.settings-panel summary').click();
  await page.getByRole('button', { name: '打开诊断' }).click();
  const dialog = page.getByRole('dialog', { name: '运行诊断' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.diagnostics-metrics')).toContainText('渲染');
  await expect(dialog.locator('.diagnostics-events')).toContainText('ROTATE');
  await expect(dialog.locator('.diagnostics-metrics')).toContainText(
    '推理 未知',
  );
  const rate = await page.evaluate(async () => {
    const start = performance.now(),
      before = window.diagnosticsFixture.snapshot()!.updates;
    for (let i = 0; i < 90; i++) await new Promise(requestAnimationFrame);
    return {
      elapsed: performance.now() - start,
      count: window.diagnosticsFixture.snapshot()!.updates - before,
    };
  });
  expect(rate.count).toBeLessThanOrEqual(Math.floor(rate.elapsed / 250) + 1);
  expect(rate.count).toBeGreaterThan(0);
  await page.getByRole('button', { name: '清空会话事件' }).click();
  expect(
    await page.evaluate(
      () => window.diagnosticsFixture.snapshot()!.events.length,
    ),
  ).toBe(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: '打开诊断' })).toBeFocused();
  const snap = await page.evaluate(() => window.diagnosticsFixture.snapshot());
  expect(snap!.rejectedEvents).toBe(0);
  expect(JSON.stringify(snap)).not.toMatch(
    /landmarks|bitmap|deviceId|C:\\Users|https?:/,
  );
  await page.evaluate(() => window.diagnosticsFixture.dispose());
  expect(
    await page.evaluate(() => window.diagnosticsFixture.snapshot()!.events),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
