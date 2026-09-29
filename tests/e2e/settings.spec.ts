/// <reference types="vite/client" />

import { test, expect } from '@playwright/test';
import { startFixtureServer } from '../support/vite-fixture.ts';
import type { AppState } from '../../src/app/index.ts';
declare global {
  interface Window {
    settingsFixture: { state(): AppState; dispose(): void };
    settingsMediaCalls: number;
  }
}
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
});
test.afterAll(async () => {
  await fixture?.close();
});
const key = 'gesture-globe.preferences.v1';
async function start(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.settingsMediaCalls = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        window.settingsMediaCalls++;
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        canvas.getContext('2d')!.fillRect(0, 0, 160, 90);
        return canvas.captureStream(1);
      },
    });
  });
  await page.goto(fixture.origin + '/tests/fixtures/settings.html');
  await page.locator('.settings-panel summary').click();
}
test('settings apply immediately, persist only the whitelist and reset only owned preference keys', async ({
  page,
}) => {
  await start(page);
  const panel = page.locator('.settings-panel');
  await panel.getByLabel('设置画质').selectOption('LOW');
  await expect(page.getByLabel('画质', { exact: true })).toHaveValue('LOW');
  await panel.getByLabel('显示手部骨架').uncheck();
  await panel.getByLabel('手势灵敏度').fill('1.5');
  await panel.getByLabel('手势灵敏度').press('Tab');
  await panel.getByLabel('反转水平手势').check();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.settingsFixture.state().preferences.sensitivity,
      ),
    )
    .toBe(1.5);
  const stored = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    key,
  );
  expect(Object.keys(stored).sort()).toEqual(
    [
      'storageVersion',
      'quality',
      'showSkeleton',
      'showPreview',
      'autoRotate',
      'reducedMotion',
      'sensitivity',
      'invertX',
      'invertY',
    ].sort(),
  );
  expect(stored).toMatchObject({
    quality: 'LOW',
    showSkeleton: false,
    sensitivity: 1.5,
    invertX: true,
  });
  await page.reload();
  await page.locator('.settings-panel summary').click();
  await expect(panel.getByLabel('设置画质')).toHaveValue('LOW');
  await expect(panel.getByLabel('显示手部骨架')).not.toBeChecked();
  expect(await page.evaluate(() => window.settingsMediaCalls)).toBe(0);
  await page.evaluate(() => {
    localStorage.setItem('unrelated', 'keep');
    localStorage.setItem(
      'gesture-globe.onboarding.v1',
      '{"schemaVersion":1,"completed":true}',
    );
  });
  await panel.getByRole('button', { name: '恢复默认设置' }).click();
  await expect(panel.getByLabel('设置画质')).toHaveValue('AUTO');
  expect(
    await page.evaluate(() => ({
      pref: localStorage.getItem('gesture-globe.preferences.v1'),
      guide: localStorage.getItem('gesture-globe.onboarding.v1'),
      unrelated: localStorage.getItem('unrelated'),
    })),
  ).toEqual({ pref: null, guide: null, unrelated: 'keep' });
});

test('system reduced motion overrides saved auto rotation and remains live without restarting motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await start(page);
  const panel = page.locator('.settings-panel');
  await panel.getByLabel('自动旋转', { exact: true }).check();
  await expect
    .poll(() =>
      page.evaluate(() => window.settingsFixture.state().view.autoRotate),
    )
    .toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(panel).toContainText('系统已要求减少动画');
  await expect(panel.getByLabel('自动旋转', { exact: true })).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() => window.settingsFixture.state().view.autoRotate),
    )
    .toBe(false);
  await page.reload();
  await page.locator('.settings-panel summary').click();
  await expect(panel.getByLabel('自动旋转', { exact: true })).not.toBeChecked();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(panel.getByLabel('自动旋转', { exact: true })).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() => window.settingsFixture.state().view.autoRotate),
    )
    .toBe(false);
  await panel.getByLabel('减少动画', { exact: true }).check();
  await expect(panel.getByLabel('自动旋转', { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.settingsMediaCalls)).toBe(0);
});

test('hidden preview preferences survive camera activation; closing releases synthetic tracks; denied storage stays usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'gesture-globe.onboarding.v1',
      '{"schemaVersion":1,"completed":true}',
    );
  });
  await start(page);
  const panel = page.locator('.settings-panel');
  await panel.getByLabel('显示摄像头预览').uncheck();
  await page.locator('.settings-panel summary').click();
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'ACTIVE',
  );
  await expect(page.getByText('画面已隐藏，摄像头仍开启。')).toBeVisible();
  await page.locator('.settings-panel summary').click();
  await panel.getByRole('button', { name: '关闭摄像头', exact: true }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'OFF',
  );
  await expect(page.locator('.camera-resource-status')).toContainText(
    '最近释放轨道：1/1',
  );
  await page.evaluate(() =>
    Object.defineProperty(Storage.prototype, 'setItem', {
      value() {
        throw new Error('denied');
      },
    }),
  );
  await panel.getByLabel('设置画质').selectOption('HIGH');
  await expect(panel).toContainText('设置仅在本次会话有效');
  await expect(page.getByLabel('画质', { exact: true })).toHaveValue('HIGH');
  await page.evaluate(() => window.settingsFixture.dispose());
  await expect(panel).toHaveCount(0);
});
