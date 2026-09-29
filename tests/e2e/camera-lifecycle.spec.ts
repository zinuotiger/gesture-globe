import { expect, test } from '../support/returning-user.ts';
declare global {
  interface Window {
    lifecycleTracks: MediaStreamTrack[];
    grantLateCamera: () => void;
  }
}
async function syntheticMedia(
  page: import('@playwright/test').Page,
  late = false,
) {
  await page.addInitScript(
    ({ late }) => {
      window.lifecycleTracks = [];
      const make = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        canvas.getContext('2d')!.fillRect(0, 0, 160, 90);
        const stream = canvas.captureStream(1);
        window.lifecycleTracks.push(...stream.getTracks());
        return stream;
      };
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: (constraints: MediaStreamConstraints) => {
          if (constraints.audio !== false)
            throw new Error('Microphone request forbidden');
          return late
            ? new Promise<MediaStream>((resolve) => {
                window.grantLateCamera = () => resolve(make());
              })
            : Promise.resolve(make());
        },
      });
    },
    { late },
  );
}
test('synthetic media: ten UI start/stop cycles leave zero live tracks and no video binding', async ({
  page,
}) => {
  await syntheticMedia(page);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '启用手势控制' }),
  ).toBeVisible();
  const results = await page.evaluate(async () => {
    const panel = document.querySelector<HTMLElement>('.camera-panel')!;
    const button = (label: string) =>
      Array.from(panel.querySelectorAll('button')).find(
        (b) => b.textContent === label,
      )!;
    const ready = () =>
      new Promise<void>((resolve) => {
        const observer = new MutationObserver(() => {
          if (panel.dataset.videoState === 'ready') {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(panel, {
          attributes: true,
          attributeFilter: ['data-video-state'],
        });
      });
    const results = [];
    for (let i = 0; i < 10; i++) {
      const waiting = ready();
      button('启用手势控制').click();
      await waiting;
      const live = window.lifecycleTracks.filter(
        (track) => track.readyState === 'live',
      ).length;
      button('关闭摄像头').click();
      results.push({
        live,
        ended: window.lifecycleTracks.every(
          (track) => track.readyState === 'ended',
        ),
        detached: panel.querySelector('video')!.srcObject === null,
        off: panel.dataset.cameraState === 'OFF',
      });
    }
    return { results, count: window.lifecycleTracks.length };
  });
  expect(results.count).toBe(10);
  expect(results.results).toEqual(
    Array.from({ length: 10 }, () => ({
      live: 1,
      ended: true,
      detached: true,
      off: true,
    })),
  );
});
test('synthetic late grant after cancellation never activates the preview', async ({
  page,
}) => {
  await syntheticMedia(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'REQUESTING',
  );
  await page.getByRole('button', { name: '取消授权等待' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'OFF',
  );
  await page.evaluate(() => window.grantLateCamera());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.lifecycleTracks.length === 1 &&
          window.lifecycleTracks[0]!.readyState === 'ended',
      ),
    )
    .toBe(true);
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'OFF',
  );
  expect(
    await page
      .locator('.camera-preview')
      .evaluate((video: HTMLVideoElement) => video.srcObject),
  ).toBe(null);
});
test('synthetic active stream is released on pagehide', async ({ page }) => {
  await syntheticMedia(page);
  await page.goto('/');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-video-state',
    'ready',
  );
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'OFF',
  );
  expect(
    await page.evaluate(() =>
      window.lifecycleTracks.every((track) => track.readyState === 'ended'),
    ),
  ).toBe(true);
});
