/// <reference types="vite/client" />

import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
import type { AppState } from '../../src/app/index.ts';
declare global {
  interface Window {
    visualFixture: { state(): AppState; seed(): void; dispose(): void };
  }
}
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
});
test.afterAll(async () => {
  await fixture?.close();
});

async function assertUsable(locator: import('@playwright/test').Locator) {
  await expect(locator).toBeVisible();
  expect(
    await locator.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
      return (
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= innerWidth &&
        rect.bottom <= innerHeight &&
        !!hit &&
        (node === hit || node.contains(hit))
      );
    }),
  ).toBe(true);
}
test('desktop core states fit without page scrolling, camera close stays reachable beside synthetic feedback, selection and error', async ({
  page,
}, info) => {
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
  await page.route('**/gesture_recognizer.task', (route) =>
    route.fulfill({ status: 503, body: 'visual-fixture model failure' }),
  );
  await page.goto(fixture.origin + '/tests/fixtures/visual-states.html');
  await assertUsable(page.getByRole('button', { name: '启用手势控制' }));
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'ACTIVE',
  );
  await expect(page.locator('.gesture-feedback')).toContainText('不可用');
  await page.evaluate(() => window.visualFixture.seed());
  await assertUsable(
    page
      .locator('.camera-actions')
      .getByRole('button', { name: '关闭摄像头', exact: true }),
  );
  await assertUsable(
    page.getByRole('button', { name: '清除地点', exact: true }),
  );
  await assertUsable(
    page.getByRole('button', { name: '重置视角', exact: true }),
  );
  await expect(
    page.getByText('当前操作：ROTATE', { exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByText('候选：张掌 · 尚未执行', { exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(() => ({
      vertical: document.documentElement.scrollHeight <= innerHeight,
      horizontal: document.documentElement.scrollWidth <= innerWidth,
    })),
  ).toEqual({ vertical: true, horizontal: true });
  await page.screenshot({
    path: info.outputPath('states.png'),
  });
  await page
    .locator('.camera-actions')
    .getByRole('button', { name: '关闭摄像头', exact: true })
    .click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'OFF',
  );
});

test('small windows fold secondary content and keep camera controls usable; keyboard Escape restores settings/help focus', async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => new Promise(() => {}),
    }),
  );
  await page.goto(fixture.origin + '/tests/fixtures/visual-states.html');
  await page.setViewportSize({ width: 800, height: 600 });
  await expect(page.locator('.camera-secondary')).not.toHaveAttribute(
    'open',
    '',
  );
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await assertUsable(page.getByRole('button', { name: '取消授权等待' }));
  await page.getByRole('button', { name: '取消授权等待' }).click();
  const summary = page.locator('.settings-panel summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.settings-panel')).toHaveAttribute('open', '');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('设置画质')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(summary).toBeFocused();
  await expect(page.locator('.settings-panel')).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: '手势帮助' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '手势帮助' })).toBeFocused();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await assertUsable(page.getByRole('button', { name: '启用手势控制' }));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('small.png'),
  });
  await page.evaluate(() => window.visualFixture.dispose());
});
