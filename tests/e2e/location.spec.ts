import { test, expect } from '@playwright/test';
import { startFixtureServer } from '../support/vite-fixture.ts';
declare global {
  interface Window {
    cameraMapFixture: {
      overlay(): void;
      expire(): void;
      map(): { x: number; y: number } | undefined;
      dispose(): void;
    };
    locationFixture: {
      point(pointer: { x: number; y: number }): void;
      end(): void;
      select(pointer?: { x: number; y: number }): Promise<void>;
      reset(): void;
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
test('synthetic camera pointer keeps one mirror and identical mapping while preview is hidden', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        canvas.getContext('2d')!.fillRect(0, 0, 160, 90);
        return canvas.captureStream(1);
      },
    });
  });
  await page.goto(fixture.origin + '/tests/fixtures/camera-map.html');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-video-state',
    'ready',
  );
  const visible = await page.evaluate(() => window.cameraMapFixture.map());
  expect(visible).toEqual({ x: 668, y: 400 });
  await page.getByRole('button', { name: '隐藏画面', exact: true }).click();
  expect(await page.evaluate(() => window.cameraMapFixture.map())).toEqual(
    visible,
  );
  await page.getByRole('button', { name: '关闭摄像头', exact: true }).click();
  expect(
    await page.evaluate(() => window.cameraMapFixture.map()),
  ).toBeUndefined();
  await page.evaluate(() => window.cameraMapFixture.dispose());
});
test('synthetic pointer uses live arbitration, raycast and dwell; card survives reset and clears explicitly', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(fixture.origin + '/tests/fixtures/location-harness.html');
  await page.waitForFunction(() => !!window.locationFixture);
  await page.evaluate(() => window.locationFixture.select());
  const card = page.getByRole('region', { name: '选中地点' });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-city-status', /MATCHED|UNMATCHED/);
  await expect(card).toContainText('纬度');
  const id = await card.getAttribute('data-selection-id');
  await page.evaluate(() => window.locationFixture.reset());
  await expect(card).toHaveAttribute('data-selection-id', id!);
  await card.getByRole('button', { name: '聚焦地点' }).click();
  await expect(card).toHaveAttribute('data-selection-id', id!);
  await card.getByRole('button', { name: '清除地点' }).click();
  await expect(card).toBeHidden();
  await page.evaluate(() => window.locationFixture.dispose());
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('city HTTP failure retains coordinates and explicit retry recovers without a new selection', async ({
  page,
}) => {
  const url = '**/data/cities-natural-earth-5.1.2.json';
  await page.route(url, (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  );
  await page.goto(fixture.origin + '/tests/fixtures/location-harness.html');
  await page.waitForFunction(() => !!window.locationFixture);
  await page.evaluate(() => window.locationFixture.select());
  const card = page.getByRole('region', { name: '选中地点' });
  await expect(card).toHaveAttribute('data-city-status', 'ERROR');
  await expect(card).toContainText('已保留坐标');
  const id = await card.getAttribute('data-selection-id');
  await page.unroute(url);
  await card.getByRole('button', { name: '重载城市数据' }).click();
  await expect(card).toHaveAttribute('data-city-status', /MATCHED|UNMATCHED/);
  await expect(card).toHaveAttribute('data-selection-id', id!);
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await page.evaluate(() => window.locationFixture.dispose());
});
