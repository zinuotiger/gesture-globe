import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
import type { ToolCall, ToolResult } from '../../src/agent/index.ts';
import type { ViewState } from '../../src/shared/index.ts';
declare global {
  interface Window {
    agentFixture: {
      execute(call: ToolCall): Promise<ToolResult>;
      view(): ViewState;
      cancel(): void;
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
test('optional tools reach real view and location; actual mouse preempts focus', async ({
  page,
}) => {
  await page.goto(fixture.origin + '/tests/fixtures/agent.html');
  await expect(page.locator('canvas')).toBeVisible();
  const response = await page.evaluate(() =>
    window.agentFixture.execute({
      name: 'focusLocation',
      args: { lat: 10, lon: 20 },
    }),
  );
  expect(response.status).toBe('SUCCEEDED');
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await page.evaluate(() => window.agentFixture.view().transition)).toBe(
    'IDLE',
  );
  expect(
    (
      await page.evaluate(() =>
        window.agentFixture.execute({ name: 'resetView', args: {} }),
      )
    ).status,
  ).toBe('REJECTED');
  await page.mouse.up();
  // Poll observed lease expiry, not a fixed delay or an automatic command retry.
  await expect(page.locator('.control-source')).toContainText('待命');
  const selected = await page.evaluate(() =>
    window.agentFixture.execute({
      name: 'selectGeo',
      args: { lat: 39.9, lon: 116.4 },
    }),
  );
  expect(selected.status).toBe('SUCCEEDED');
  await expect(page.locator('.location-card')).toContainText('39.9000');
  await page.evaluate(() => window.agentFixture.dispose());
  await expect(canvas).toHaveCount(0);
});
