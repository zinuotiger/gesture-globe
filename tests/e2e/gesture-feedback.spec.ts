import { test, expect } from '@playwright/test';
import { startFixtureServer } from '../support/vite-fixture.ts';
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
});
test.afterAll(async () => {
  await fixture?.close();
});
test('synthetic DTO overlay mirrors once, has 21 points, independent hide controls and stale clearing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const c = document.createElement('canvas');
        c.width = 160;
        c.height = 90;
        c.getContext('2d')!.fillRect(0, 0, 160, 90);
        return c.captureStream(1);
      },
    });
  });
  await page.goto(fixture.origin + '/tests/fixtures/camera-map.html');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-video-state',
    'ready',
  );
  await page.evaluate(() => window.cameraMapFixture.overlay());
  const overlay = page.locator('.camera-overlay');
  await expect(overlay.locator('circle')).toHaveCount(21);
  await expect(overlay.locator('circle').first()).toHaveAttribute('cx', '180');
  await expect(overlay.locator('circle').first()).toHaveAttribute('cy', '67.5');
  await page.getByRole('button', { name: '隐藏骨架' }).click();
  await page.evaluate(() => window.cameraMapFixture.overlay());
  await expect(overlay.locator('circle')).toHaveCount(0);
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'ACTIVE',
  );
  await page.getByRole('button', { name: '显示骨架' }).click();
  await page.evaluate(() => window.cameraMapFixture.overlay());
  await expect(overlay.locator('circle')).toHaveCount(21);
  await page.getByRole('button', { name: '隐藏画面', exact: true }).click();
  await page.evaluate(() => window.cameraMapFixture.overlay());
  await expect(overlay.locator('circle')).toHaveCount(0);
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'ACTIVE',
  );
  await page.getByRole('button', { name: '显示画面', exact: true }).click();
  await page.evaluate(() => window.cameraMapFixture.overlay());
  await page.waitForFunction(() => {
    window.cameraMapFixture.expire();
    return document.querySelectorAll('.camera-overlay circle').length === 0;
  });
  await page.getByRole('button', { name: '关闭摄像头', exact: true }).click();
  await expect(overlay.locator('circle')).toHaveCount(0);
  await page.evaluate(() => window.cameraMapFixture.dispose());
});
test('live raycast displays hit/miss, same-source dwell arc, stale and explicit cancellation', async ({
  page,
}) => {
  await page.goto(fixture.origin + '/tests/fixtures/location-harness.html');
  await page.waitForFunction(() => !!window.locationFixture);
  const ring = page.locator('.pointing-feedback');
  const observed = await page.evaluate(async () => {
    window.locationFixture.point({ x: 0.5, y: 0.5 });
    const before = performance.now();
    let result;
    do {
      await new Promise(requestAnimationFrame);
      window.locationFixture.point({ x: 0.5, y: 0.5 });
      const e = document.querySelector<HTMLElement>('.pointing-feedback')!;
      if (Number(e.dataset.progress) > 0)
        result = {
          progress: Number(e.dataset.progress),
          arc: e.querySelector('circle')!.getAttribute('stroke-dasharray'),
          hit: e.dataset.hit,
        };
    } while (!result && performance.now() - before < 650);
    return result;
  });
  expect(observed?.hit).toBe('true');
  expect(observed!.progress).toBeGreaterThan(0);
  expect(observed!.arc).toBe(`${observed!.progress} 1`);
  await expect(ring).toBeHidden(); // stale expiry driven by actual render loop, no test sleep
  await page.evaluate(() => window.locationFixture.point({ x: 0.03, y: 0.5 }));
  await expect(ring).toHaveAttribute('data-hit', 'false');
  await expect(ring).toHaveAttribute('data-progress', '0');
  await page.evaluate(() => window.locationFixture.end());
  await expect(ring).toBeHidden();
  await page.evaluate(() => window.locationFixture.dispose());
});
