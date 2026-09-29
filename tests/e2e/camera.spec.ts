import { expect, test } from '../support/returning-user.ts';
declare global {
  interface Window {
    cameraFixtureTracks: MediaStreamTrack[];
  }
}
test('explicit activation entry never requests media at startup', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => {
        throw new Error('Unexpected first-load media access');
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '启用手势控制' }),
  ).toBeVisible();
  await expect(page.getByText('摄像头已关闭', { exact: true })).toBeVisible();
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  expect(errors).toEqual([]);
});
test('synthetic browser stream: hide keeps track live, close releases and detaches video', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.cameraFixtureTracks = [];
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async (constraints: MediaStreamConstraints) => {
        if (constraints.audio !== false) throw new Error('audio requested');
        // Generated canvas, not a real camera or recognition result.
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#48a';
        context.fillRect(0, 0, 160, 90);
        const stream = canvas.captureStream(1);
        window.cameraFixtureTracks.push(...stream.getTracks());
        return stream;
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-video-state',
    'ready',
  );
  const video = page.locator('.camera-preview');
  await expect(video).toBeVisible();
  expect(await video.evaluate((node) => getComputedStyle(node).transform)).toBe(
    'matrix(-1, 0, 0, 1, 0, 0)',
  );
  await page.getByRole('button', { name: '隐藏画面', exact: true }).click();
  await expect(video).toBeHidden();
  await expect(
    page.getByText('画面已隐藏，摄像头仍开启。', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.cameraFixtureTracks.every((track) => track.readyState === 'live'),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '显示画面', exact: true }).click();
  await expect(video).toBeVisible();
  await page.getByRole('button', { name: '关闭摄像头', exact: true }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'OFF',
  );
  expect(
    await page.evaluate(() =>
      window.cameraFixtureTracks.every((track) => track.readyState === 'ended'),
    ),
  ).toBe(true);
  expect(await video.evaluate((node: HTMLVideoElement) => node.srcObject)).toBe(
    null,
  );
  await expect(video).toBeHidden();
});
test('denied permission is requested only after click and never retried automatically', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let requests = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async (constraints: MediaStreamConstraints) => {
        if (constraints.audio !== false) throw new Error('Audio must be false');
        document.documentElement.dataset.mediaRequests = String(++requests);
        throw new DOMException('test denial', 'NotAllowedError');
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute(
    'data-media-requests',
    /./,
  );
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'ERROR',
  );
  await expect(page.locator('.camera-panel')).toContainText('浏览器或系统设置');
  await expect(page.locator('html')).toHaveAttribute(
    'data-media-requests',
    '1',
  );
  await expect(page.getByText('摄像头已关闭', { exact: true })).toBeVisible();
});
