import { expect, test } from '../support/returning-user.ts';
import {
  createServer,
  optimizeDeps,
  resolveConfig,
  type ViteDevServer,
  type InlineConfig,
} from 'vite';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

let server: ViteDevServer, origin: string, cache: string;
const cacheParent = path.resolve('node_modules/.cache');
test.beforeAll(async () => {
  await mkdir(cacheParent, { recursive: true });
  cache = await mkdtemp(path.join(cacheParent, 'gesture-vite-'));
  const options: InlineConfig = {
    cacheDir: cache,
    optimizeDeps: {
      include: [
        '@mediapipe/tasks-vision',
        'three',
        'three/addons/controls/OrbitControls.js',
      ],
    },
    server: { host: '127.0.0.1', port: 0 },
  };
  // Finish development-only compilation before measuring product initialization.
  // This never fetches or instantiates the model, WASM, browser, or Worker.
  await optimizeDeps(await resolveConfig(options, 'serve'));
  server = await createServer(options);
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP server');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  await server?.close();
  if (cache?.startsWith(cacheParent + path.sep))
    await rm(cache, { recursive: true, force: true });
});

test('synthetic blank camera goes through the real local MediaPipe worker and stops on close', async ({
  page,
}) => {
  const errors: string[] = [];
  const modelRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (request) => {
    if (request.url().endsWith('gesture_recognizer.task'))
      modelRequests.push(request.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async (constraints: MediaStreamConstraints) => {
        if (constraints.audio !== false) throw new Error('Audio forbidden');
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        canvas.getContext('2d')!.fillRect(0, 0, 256, 256);
        return canvas.captureStream(1); // Synthetic input only; model and worker are real.
      },
    });
  });
  await page.goto(origin);
  const feedback = page.locator('.gesture-feedback');
  await expect(feedback).toHaveAttribute('data-phase', 'STOPPED');
  expect(modelRequests).toHaveLength(0);
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(feedback).toHaveAttribute('data-phase', 'READY', {
    timeout: 15000,
  });
  await expect
    .poll(
      async () => Number(await feedback.getAttribute('data-accepted-frames')),
      { timeout: 10000 },
    )
    .toBeGreaterThan(0);
  await expect(feedback).toContainText('等待手势');
  await expect(page.getByRole('region', { name: '运行状态' })).toContainText(
    '识别：就绪 · 手：未检测到',
  );
  expect(modelRequests.length).toBeGreaterThan(0);
  expect(
    modelRequests.every(
      (url) => new URL(url).origin === new URL(page.url()).origin,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '隐藏画面', exact: true }).click();
  await expect(feedback).toHaveAttribute('data-phase', 'READY');
  await page.getByRole('button', { name: '关闭摄像头', exact: true }).click();
  await expect(feedback).toHaveAttribute('data-phase', 'STOPPED');
  const accepted = await feedback.getAttribute('data-accepted-frames');
  await expect(page.getByRole('region', { name: '运行状态' })).toContainText(
    '摄像头：关闭 · 识别：未运行',
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(await feedback.getAttribute('data-accepted-frames')).toBe(accepted);
  expect(errors).toEqual([]);
});

test('production preview excludes the unresolved model and explicitly degrades while keyboard remains usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        canvas.getContext('2d')!.fillRect(0, 0, 256, 256);
        return canvas.captureStream(1);
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.gesture-feedback')).toHaveAttribute(
    'data-phase',
    'DEGRADED',
    { timeout: 15000 },
  );
  await expect(page.locator('.gesture-feedback')).toContainText('E-VIS-001');
  await page.locator('.globe-surface canvas').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.control-source')).toContainText('键盘');
  await page.getByRole('button', { name: '关闭摄像头', exact: true }).click();
  await expect(page.locator('.gesture-feedback')).toHaveAttribute(
    'data-phase',
    'STOPPED',
  );
});
