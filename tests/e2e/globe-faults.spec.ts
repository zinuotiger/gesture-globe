import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    contextExtension: WEBGL_lose_context;
  }
}
test('actual texture 404 remains interactive and retry is bounded', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/textures/*.jpg', (route) => {
    requests++;
    return route.fulfill({ status: 404, body: 'missing test asset' });
  });
  await page.goto('/');
  const host = page.locator('.globe-surface');
  await expect(host).toHaveAttribute('data-earth-state', 'failed');
  await expect(host).toHaveAttribute('data-render-state', 'rendered');
  await expect(page.getByRole('status')).toContainText('备用材质');
  expect(requests).toBe(2);
  const canvas = host.locator('canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 80,
    box.y + box.height / 2 + 30,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.mouse.wheel(0, -100);
  await expect(host).toHaveAttribute('data-render-state', 'rendered');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
async function lose(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-earth-state',
    'ready',
  );
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '.globe-surface canvas',
    )!;
    const extension = canvas
      .getContext('webgl2')
      ?.getExtension('WEBGL_lose_context');
    if (!extension)
      throw new Error('Real WEBGL_lose_context extension required');
    window.contextExtension = extension;
    extension.loseContext();
  });
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'context-lost',
  );
  await expect(page.getByRole('status')).toContainText('等待浏览器恢复');
}
test('actual WebGL context loss/restoration returns to rendering', async ({
  page,
}) => {
  await lose(page);
  await page.evaluate(() => window.contextExtension.restoreContext());
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  await expect(page.getByRole('status')).toContainText('拖动旋转');
});
test('unrestored WebGL context shows static fallback rather than a blank page', async ({
  page,
}) => {
  await lose(page);
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'failed',
    { timeout: 10000 },
  );
  await expect(page.getByRole('status')).toContainText('请重新加载页面');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
