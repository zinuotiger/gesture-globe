/// <reference types="vite/client" />
import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
import type { AppState } from '../../src/app/index.ts';
declare global {
  interface Window {
    errorFixture: { state(): AppState; seedSelection(): void; dispose(): void };
    recoveryCalls: number;
    recoveryWorkers: { started: number; ended: number };
  }
}
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
});
test.afterAll(async () => {
  await fixture?.close();
});
test('denial retry is explicit; vision retry uses a new operation, and mouse fallback releases resources without losing selection/view', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.recoveryCalls = 0;
    window.recoveryWorkers = { started: 0, ended: 0 };
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        window.recoveryWorkers.started++;
      }
      terminate() {
        window.recoveryWorkers.ended++;
        super.terminate();
      }
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        if (++window.recoveryCalls === 1)
          throw new DOMException('sensitive secret path', 'NotAllowedError');
        const c = document.createElement('canvas');
        c.width = 160;
        c.height = 90;
        c.getContext('2d')!.fillRect(0, 0, 160, 90);
        return c.captureStream(1);
      },
    });
  });
  await page.route('**/gesture_recognizer.task', (route) =>
    route.fulfill({ status: 503, body: 'model unavailable fixture' }),
  );
  await page.goto(fixture.origin + '/tests/fixtures/error-harness.html');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  const center = page.getByRole('region', { name: '错误与恢复' });
  await expect(center).toContainText('摄像头权限未获允许');
  await expect(center).toContainText('鼠标和键盘');
  await expect(center).not.toContainText('sensitive');
  expect(await page.evaluate(() => window.recoveryCalls)).toBe(1);
  await center.getByRole('button', { name: '重试摄像头', exact: true }).click();
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'ACTIVE',
  );
  await expect(center).toContainText('本地手势识别暂不可用');
  expect(await page.evaluate(() => window.recoveryCalls)).toBe(2);
  const previous = await page.evaluate(
    () => window.errorFixture.state().operationId,
  );
  await center
    .getByRole('button', { name: '重试手势识别', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.errorFixture.state().operationId))
    .not.toBe(previous);
  await expect(page.locator('.gesture-feedback')).toHaveAttribute(
    'data-phase',
    'DEGRADED',
    { timeout: 15000 },
  );
  expect(await page.evaluate(() => window.recoveryCalls)).toBe(2);
  await page.evaluate(() => window.errorFixture.seedSelection());
  const values = await page.evaluate(() => {
    const before = window.errorFixture.state();
    [...document.querySelectorAll<HTMLButtonElement>('.error-center button')]
      .find((b) => b.textContent === '继续用鼠标')!
      .click();
    return {
      before,
      after: window.errorFixture.state(),
      workers: window.recoveryWorkers,
    };
  });
  expect(values.after.cameraStatus).toBe('OFF');
  expect(values.after.visionStatus).toBe('OFF');
  expect(values.after.gesture.kind).toBe('NONE');
  expect(values.after.selection.value).toEqual(values.before.selection.value);
  expect(values.after.view).toEqual(values.before.view);
  expect(values.workers.started).toBeGreaterThan(0);
  expect(values.workers.ended).toBe(values.workers.started);
  await expect(center).toBeHidden();
  await expect(page.locator('.camera-resource-status')).toContainText(
    '活动轨道：0',
  );
  await expect(page.locator('.camera-resource-status')).toContainText('1/1');
  await page.evaluate(() => window.errorFixture.dispose());
});
test('texture failure has scoped retry and clears only after actual successful fetch', async ({
  page,
}) => {
  await page.route('**/textures/*.jpg', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  );
  await page.goto('/');
  const center = page.getByRole('region', { name: '错误与恢复' });
  await expect(center).toContainText('地球纹理加载失败');
  await page.unroute('**/textures/*.jpg');
  await center.getByRole('button', { name: '重载地球纹理' }).click();
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-earth-state',
    'ready',
  );
  await expect(center).toBeHidden();
  await expect(
    page.getByRole('button', { name: '启用手势控制' }),
  ).toBeEnabled();
});
test('unavailable WebGL enters a static FATAL view with no camera action or permission request', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.recoveryCalls = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        window.recoveryCalls++;
        throw new Error('forbidden');
      },
    });
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (
        this: HTMLCanvasElement,
        ...args: Parameters<typeof original>
      ) {
        return String(args[0]).startsWith('webgl')
          ? null
          : original.apply(this, args);
      },
    });
  });
  await page.goto('/');
  const center = page.getByRole('region', { name: '错误与恢复' });
  await expect(center).toHaveAttribute('data-fatal', 'true');
  await expect(center).toContainText('摄像头已关闭');
  await expect(page.getByRole('button', { name: '启用手势控制' })).toHaveCount(
    0,
  );
  await expect(
    center.getByRole('button', { name: '重新加载页面' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.recoveryCalls)).toBe(0);
});
