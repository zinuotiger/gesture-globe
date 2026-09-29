import { expect, test } from '@playwright/test';

test('foundation loads with camera off and no browser errors', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => {
        throw new Error('Unexpected media request on first page load');
      },
    });
  });
  await page.goto('/');
  await expect(page).toHaveTitle('Gesture Globe · 手势地球');
  await expect(page.locator('#app')).toHaveAttribute(
    'data-app-phase',
    'GLOBE_READY',
  );
  await expect(page.getByText('摄像头已关闭', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-earth-state',
    'ready',
  );
  await expect(page.getByRole('status')).toContainText('拖动旋转');
  await page.screenshot({
    path: testInfo.outputPath('globe.png'),
  });
  const canvas = page.locator('.globe-surface canvas');
  await expect(canvas).toHaveCount(1);
  await page.getByRole('combobox', { name: '画质' }).selectOption('LOW');
  await expect(page.getByRole('combobox', { name: '画质' })).toHaveValue('LOW');
  await page.getByRole('combobox', { name: '画质' }).selectOption('AUTO');
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect
    .poll(() =>
      canvas.evaluate(
        (node: HTMLCanvasElement) =>
          node.width === node.clientWidth && node.height === node.clientHeight,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('unavailable WebGL shows an explicit fallback and keeps the page usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (
        this: HTMLCanvasElement,
        ...args: Parameters<typeof original>
      ) {
        if (String(args[0]).startsWith('webgl')) return null;
        return original.apply(this, args);
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'failed',
  );
  await expect(page.getByRole('status')).toContainText('无法启动三维场景');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('摄像头已关闭', { exact: true })).toBeVisible();
});
test('keyboard focus and semantic activation operate globe without media permission', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => {
        throw new Error('No media allowed in fallback test');
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-earth-state',
    'ready',
  );
  const group = page.getByRole('group', { name: '地球备用控制' });
  const actions = [
    '向左旋转',
    '向右旋转',
    '向上旋转',
    '向下旋转',
    '放大地球',
    '缩小地球',
    '重置视角',
    '取消过渡',
  ];
  // Focus first semantic control, then use only Tab and keyboard activation.
  await group.getByRole('button', { name: '向左旋转', exact: true }).focus();
  for (const label of actions) {
    await expect(
      group.getByRole('button', { name: label, exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
  }
  const canvas = page.locator('.globe-surface canvas');
  const before = await canvas.screenshot();
  await group.getByRole('button', { name: '向右旋转', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.control-source')).toContainText('页面按钮');
  // Wait for the actual renderer frames, then compare once. Screenshot encoding
  // is expensive under concurrent GPU tests and must not run inside a 5s poll.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  await expect(page.getByText('摄像头已关闭', { exact: true })).toBeVisible();
});
