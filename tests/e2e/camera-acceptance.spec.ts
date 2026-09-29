import { expect, test } from '../support/returning-user.ts';

declare global {
  interface Window {
    acceptanceStream: MediaStream;
  }
}
test('synthetic camera interruption and explicit close update observed release counts', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async (constraints: MediaStreamConstraints) => {
        if (constraints.audio !== false)
          throw new Error('Microphone forbidden');
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        canvas.getContext('2d')!.fillRect(0, 0, 160, 90);
        return (window.acceptanceStream = canvas.captureStream(1));
      },
    });
  });
  await page.goto('/');
  await page.getByText('摄像头验收状态', { exact: true }).click();
  const resources = page.locator('.camera-resource-status');
  await expect(resources).toContainText('尚无关闭记录');
  const start = page.getByRole('button', { name: '启用手势控制' });
  await start.click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-video-state',
    'ready',
  );
  await expect(resources).toContainText('活动轨道：1');
  await expect(resources).toContainText('预览绑定：已连接');
  await page.evaluate(() => {
    const track = window.acceptanceStream.getVideoTracks()[0]!;
    track.stop();
    // Explicit fault injection, not a physical unplug or permission test.
    track.dispatchEvent(new Event('ended'));
  });
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'ERROR',
  );
  await expect(resources).toHaveText(
    '活动轨道：0；最近释放轨道：1/1；预览绑定：已解除',
  );
  await expect(page.locator('.camera-panel')).toContainText('连接已中断');
  await start.click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-video-state',
    'ready',
  );
  await page.getByRole('button', { name: '关闭摄像头', exact: true }).click();
  await expect(resources).toHaveText(
    '活动轨道：0；最近释放轨道：1/1；预览绑定：已解除',
  );
  expect(
    await page.evaluate(() =>
      window.acceptanceStream
        .getTracks()
        .every((track) => track.readyState === 'ended'),
    ),
  ).toBe(true);
  expect(
    await page
      .locator('video')
      .evaluate((video: HTMLVideoElement) => video.srcObject),
  ).toBe(null);
});

test('synthetic denial leaves mouse fallback usable and does not claim a stream was released', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        throw new DOMException('Injected denial', 'NotAllowedError');
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'ERROR',
  );
  await page.getByText('摄像头验收状态', { exact: true }).click();
  await expect(page.locator('.camera-resource-status')).toHaveText(
    '活动轨道：0；最近释放轨道：尚无关闭记录；预览绑定：已解除',
  );
  const box = (await page.locator('.globe-surface canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await page.mouse.wheel(0, -100);
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  await expect(page.getByRole('button', { name: '重置视角' })).toBeEnabled();
});
