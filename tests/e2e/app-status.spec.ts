import { test, expect } from '../support/returning-user.ts';
declare global {
  interface Window {
    rejectStatusPermission(): void;
  }
}
test('permission wait and denial stay distinct from OFF while keyboard fallback updates the shared status', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () =>
        new Promise((_resolve, reject) => {
          window.rejectStatusPermission = () =>
            reject(new DOMException('synthetic denial', 'NotAllowedError'));
        }),
    });
  });
  await page.goto('/');
  const bar = page.getByRole('region', { name: '运行状态' });
  await expect(bar).toContainText('摄像头：关闭 · 识别：未运行 · 手：未知');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(bar).toContainText('摄像头：等待授权 · 识别：未运行');
  await page.evaluate(() => window.rejectStatusPermission());
  await expect(bar).toContainText('摄像头：不可用 · 识别：未运行');
  await expect(page.locator('#app')).toHaveAttribute(
    'data-app-phase',
    'DEGRADED',
  );
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('ArrowLeft');
  await expect(bar).toContainText('控制：键盘');
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
});
