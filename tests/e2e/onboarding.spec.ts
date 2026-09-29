import { test, expect } from '@playwright/test';
declare global {
  interface Window {
    onboardingRequests: number;
  }
}
async function mediaCounter(
  page: import('@playwright/test').Page,
  deny = false,
) {
  await page.addInitScript(
    ({ deny }) => {
      window.onboardingRequests = 0;
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: () => {
          window.onboardingRequests++;
          return deny
            ? Promise.reject(
                new DOMException('synthetic denial', 'NotAllowedError'),
              )
            : new Promise(() => {});
        },
      });
    },
    { deny },
  );
}
test('fresh user completes exactly three keyboard-operable steps before any permission request', async ({
  page,
}) => {
  await mediaCounter(page);
  await page.goto('/');
  expect(await page.evaluate(() => window.onboardingRequests)).toBe(0);
  await page.getByRole('button', { name: '启用手势控制' }).click();
  const dialog = page.getByRole('dialog', { name: '手势入门' });
  await expect(dialog).toHaveAttribute('data-step', '1');
  await expect(dialog).toContainText('不录制、不上传');
  await expect(dialog.getByRole('button', { name: '下一步' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveAttribute('data-step', '2');
  for (const text of ['张开手掌', '捏合', '握拳', '伸出食指', 'V 字手势'])
    await expect(dialog).toContainText(text);
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveAttribute('data-step', '3');
  await expect(dialog).toContainText('摄像头未开启');
  const box = await dialog.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.evaluate(() => window.onboardingRequests)).toBe(0);
  await dialog.getByRole('button', { name: '启用并开始' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => window.onboardingRequests)).toBe(1);
  await page.getByRole('button', { name: '取消授权等待' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'OFF',
  );
});
test('Escape cancels without persistence; skip requests once and help reopens without media', async ({
  page,
}) => {
  await mediaCounter(page, true);
  await page.goto('/');
  const enable = page.getByRole('button', { name: '启用手势控制' });
  await enable.click();
  await page.keyboard.press('Escape');
  await expect(enable).toBeFocused();
  expect(await page.evaluate(() => window.onboardingRequests)).toBe(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem('gesture-globe.onboarding.v1'),
    ),
  ).toBeNull();
  await enable.click();
  await page.getByRole('button', { name: '跳过教学并启用' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'ERROR',
  );
  expect(await page.evaluate(() => window.onboardingRequests)).toBe(1);
  const help = page.getByRole('button', { name: '手势帮助' });
  await help.click();
  const dialog = page.getByRole('dialog', { name: '手势入门' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
  expect(await page.evaluate(() => window.onboardingRequests)).toBe(1);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('gesture-globe.onboarding.v1')!),
    ),
  ).toEqual({ schemaVersion: 1, completed: true });
});
test('unavailable local storage never blocks skip, camera denial or help', async ({
  page,
}) => {
  await mediaCounter(page, true);
  await page.addInitScript(() => {
    for (const name of ['getItem', 'setItem', 'removeItem'])
      Object.defineProperty(Storage.prototype, name, {
        value: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await page.getByRole('button', { name: '跳过教学并启用' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'ERROR',
  );
  await page.getByRole('button', { name: '启用手势控制' }).click();
  expect(await page.evaluate(() => window.onboardingRequests)).toBe(2);
  await expect(page.getByRole('dialog', { name: '手势入门' })).toBeHidden();
  await page.getByRole('button', { name: '手势帮助' }).click();
  await expect(page.getByRole('dialog', { name: '手势入门' })).toBeVisible();
});
