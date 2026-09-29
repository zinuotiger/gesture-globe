import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
});
test.afterAll(async () => {
  await fixture?.close();
});
test('visible progress completes real focus, undo restores prior view and cancel stops immediately', async ({
  page,
}) => {
  await page.goto(fixture.origin + '/tests/fixtures/agent.html');
  await page.getByLabel('起点纬度').fill('10');
  await page.getByLabel('起点经度').fill('20');
  await page.getByRole('button', { name: '聚焦坐标', exact: true }).click();
  await expect(page.locator('.agent-status')).toHaveAttribute(
    'data-status',
    'RUNNING',
  );
  await expect(page.locator('.agent-status')).toHaveAttribute(
    'data-status',
    'SUCCEEDED',
  );
  const before = await page.evaluate(() => window.agentFixture.view());
  await page.getByLabel('起点纬度').fill('30');
  await page.getByLabel('起点经度').fill('80');
  await page.getByRole('button', { name: '聚焦坐标', exact: true }).click();
  await expect(page.locator('.agent-status')).toHaveAttribute(
    'data-status',
    'RUNNING',
  );
  await expect(page.locator('.agent-status')).toHaveAttribute(
    'data-status',
    'SUCCEEDED',
  );
  await page.getByRole('button', { name: '撤销视图', exact: true }).click();
  await expect(page.locator('.agent-status')).toHaveAttribute(
    'data-status',
    'RUNNING',
  );
  await expect(page.locator('.agent-status')).toHaveAttribute(
    'data-status',
    'SUCCEEDED',
  );
  const after = await page.evaluate(() => window.agentFixture.view());
  expect(after.azimuth).toBeCloseTo(before.azimuth, 8);
  expect(after.polar).toBeCloseTo(before.polar, 8);
  expect(after.distance).toBeCloseTo(before.distance, 8);
  await page.evaluate(async () => {
    await window.agentFixture.execute({ name: 'resetView', args: {} });
    window.agentFixture.cancel();
  });
  await expect(page.locator('.agent-status')).toHaveAttribute(
    'data-status',
    'CANCELLED',
  );
  expect(await page.evaluate(() => window.agentFixture.view().transition)).toBe(
    'IDLE',
  );
  await expect(page.locator('.control-source')).toContainText('待命');
  await page.evaluate(() => window.agentFixture.dispose());
  await expect(page.locator('.agent-panel')).toHaveCount(0);
});
