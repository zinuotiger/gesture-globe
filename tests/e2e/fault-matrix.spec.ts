import { readFileSync } from 'node:fs';
import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
import type { AppError } from '../../src/shared/index.ts';
declare global {
  interface Window {
    faultCalls: number;
    faultWorkers: { started: number; ended: number; results: number };
    faultTracks: MediaStreamTrack[];
    faultCatalog: {
      raise(row: Pick<AppError, 'code' | 'module' | 'severity'>): void;
      dispose(): void;
    };
  }
}
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
});
test.afterAll(async () => {
  await fixture?.close();
});
for (const [name, code, calls] of [
  ['NotAllowedError', 'E-CAM-001', 1],
  ['NotFoundError', 'E-CAM-002', 1],
  ['NotReadableError', 'E-CAM-003', 1],
  ['OverconstrainedError', 'E-CAM-004', 2],
  ['AbortError', 'E-CAM-003', 1],
  ['InvalidStateError', 'E-CAM-003', 1],
] as const) {
  test(`browser API fault ${name} keeps globe usable with bounded permission attempts`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((name) => {
      window.faultCalls = 0;
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async (constraints: MediaStreamConstraints) => {
          if (constraints.audio !== false) throw Error('microphone forbidden');
          window.faultCalls++;
          throw new DOMException('secret-identity private-device-id', name);
        },
      });
    }, name);
    await page.goto('/');
    await page.getByRole('button', { name: '启用手势控制' }).click();
    await expect(page.locator(`[data-error-code="${code}"]`)).toBeVisible();
    expect(await page.evaluate(() => window.faultCalls)).toBe(calls);
    await page.getByRole('button', { name: '向左旋转', exact: true }).click();
    await expect(page.locator('.globe-surface')).toHaveAttribute(
      'data-render-state',
      'rendered',
    );
    await expect(page.locator('body')).not.toContainText('secret-identity');
    expect(errors).toEqual([]);
  });
}
for (const missing of ['media', 'worker'] as const) {
  test(`missing ${missing} capability rejects activation before permission`, async ({
    page,
  }) => {
    await page.addInitScript((missing) => {
      window.faultCalls = 0;
      if (missing === 'media')
        Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
      else {
        Object.defineProperty(window, 'Worker', { value: undefined });
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
          value: async () => {
            window.faultCalls++;
            throw Error('permission should not be requested');
          },
        });
      }
    }, missing);
    await page.goto('/');
    await page.getByRole('button', { name: '启用手势控制' }).click();
    await expect(page.locator('[data-error-code="E-CAP-002"]')).toBeVisible();
    expect(await page.evaluate(() => window.faultCalls)).toBe(0);
    await page.getByRole('button', { name: '向右旋转', exact: true }).click();
    await expect(page.locator('.globe-surface')).toHaveAttribute(
      'data-render-state',
      'rendered',
    );
  });
}
async function syntheticCamera(
  page: import('@playwright/test').Page,
  crash: boolean,
) {
  await page.addInitScript((crash) => {
    window.faultWorkers = { started: 0, ended: 0, results: 0 };
    window.faultCalls = 0;
    window.faultTracks = [];
    const Original = window.Worker;
    window.Worker = class extends Original {
      private stopped = false;
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        window.faultWorkers.started++;
        let injected = false;
        this.addEventListener('message', (event) => {
          if (crash && !injected && event.data?.type === 'FRAME_RESULT') {
            injected = true;
            window.faultWorkers.results++;
            queueMicrotask(() =>
              this.dispatchEvent(
                new ErrorEvent('error', { message: 'synthetic worker crash' }),
              ),
            );
          }
        });
      }
      terminate() {
        if (!this.stopped) {
          this.stopped = true;
          window.faultWorkers.ended++;
        }
        super.terminate();
      }
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async (constraints: MediaStreamConstraints) => {
        if (constraints.audio !== false) throw Error('microphone forbidden');
        window.faultCalls++;
        const c = document.createElement('canvas');
        c.width = 160;
        c.height = 90;
        c.getContext('2d')!.fillRect(0, 0, 160, 90);
        const stream = c.captureStream(1);
        window.faultTracks.push(...stream.getTracks());
        return stream;
      },
    });
  }, crash);
}
test('actual local model worker crash injection restarts once then degrades, with all workers and tracks releasable', async ({
  page,
}) => {
  await syntheticCamera(page, true);
  await page.goto(fixture.origin + '/tests/fixtures/error-harness.html');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.gesture-feedback')).toHaveAttribute(
    'data-phase',
    'DEGRADED',
    { timeout: 15000 },
  );
  expect(await page.evaluate(() => window.faultWorkers)).toEqual({
    started: 2,
    ended: 2,
    results: 2,
  });
  expect(await page.evaluate(() => window.faultCalls)).toBe(1);
  await expect(page.locator('[data-error-code="E-VIS-003"]')).toBeVisible();
  await page.getByRole('button', { name: '向左旋转', exact: true }).click();
  await page.getByRole('button', { name: '关闭摄像头', exact: true }).click();
  expect(
    await page.evaluate(() =>
      window.faultTracks.every((t) => t.readyState === 'ended'),
    ),
  ).toBe(true);
  await page.evaluate(() => window.errorFixture.dispose());
});
test('actual WASM HTTP failure is specific, retries once and leaves manual controls usable', async ({
  page,
}) => {
  await syntheticCamera(page, false);
  let requests = 0;
  await page.route('**/*.wasm', (route) => {
    requests++;
    return route.fulfill({ status: 404, body: 'synthetic WASM failure' });
  });
  await page.goto(fixture.origin + '/tests/fixtures/error-harness.html');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.gesture-feedback')).toHaveAttribute(
    'data-phase',
    'DEGRADED',
    { timeout: 15000 },
  );
  await expect(page.locator('[data-error-code="E-VIS-002"]')).toBeVisible();
  expect(requests).toBe(2);
  expect(await page.evaluate(() => window.faultWorkers.started)).toBe(2);
  await page.getByRole('button', { name: '向右旋转', exact: true }).click();
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  await page.getByRole('button', { name: '关闭摄像头', exact: true }).click();
  expect(await page.evaluate(() => window.faultWorkers.ended)).toBe(2);
  await page.evaluate(() => window.errorFixture.dispose());
});
test('zero video dimensions reach the actual metadata deadline and release synthetic tracks without blanking the globe', async ({
  page,
}) => {
  await syntheticCamera(page, false);
  await page.addInitScript(() =>
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      get: () => 0,
    }),
  );
  await page.goto(fixture.origin + '/tests/fixtures/error-harness.html');
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('[data-error-code="E-CAM-007"]')).toBeVisible({
    timeout: 12000,
  });
  expect(await page.evaluate(() => window.faultTracks.length)).toBe(1);
  expect(
    await page.evaluate(() =>
      window.faultTracks.every((t) => t.readyState === 'ended'),
    ),
  ).toBe(true);
  expect(
    await page
      .locator('video')
      .evaluate((v: HTMLVideoElement) => v.srcObject === null),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => window.faultWorkers.started === window.faultWorkers.ended,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '向左旋转', exact: true }).click();
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  await page.evaluate(() => window.errorFixture.dispose());
});
test('every canonical P0 error has nonblank safe presentation; INFO stays quiet and FATAL is a static accessible fallback', async ({
  page,
}) => {
  const text = readFileSync('docs/Gesture_Globe_实施级需求规格_v3.0.md', 'utf8')
    .split('## 20.1')[1]!
    .split('## 20.2')[0]!;
  const rows = [
    ...text.matchAll(
      /\| (E-[A-Z0-9-]+) \| (M\d+) \| (INFO|WARNING|ERROR|FATAL) \|/g,
    ),
  ]
    .filter((m) => m[2] !== 'M12')
    .map(
      (m) =>
        ({ code: m[1], module: m[2], severity: m[3] }) as Pick<
          AppError,
          'code' | 'module' | 'severity'
        >,
    );
  expect(rows).toHaveLength(34);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(fixture.origin + '/tests/fixtures/fault-catalog.html');
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  for (const row of rows.sort(
    (a, b) => Number(a.severity === 'FATAL') - Number(b.severity === 'FATAL'),
  )) {
    await page.evaluate((row) => window.faultCatalog.raise(row), row);
    const card = page.locator(`[data-error-code="${row.code}"]`);
    if (row.severity === 'INFO') await expect(card).toHaveCount(0);
    else {
      await expect(card).toBeVisible();
      expect((await card.innerText()).length).toBeGreaterThan(20);
    }
    await expect(page.locator('body')).not.toContainText('private-device-id');
    await expect(page.locator('body')).not.toContainText('secret-identity');
    if (row.severity !== 'FATAL')
      await expect(
        page.getByRole('button', { name: '向左旋转', exact: true }),
      ).toBeEnabled();
    else
      await expect(
        page.getByRole('button', { name: '重新加载页面', exact: true }),
      ).toBeVisible();
  }
  expect(errors).toEqual([]);
  await page.evaluate(() => window.faultCatalog.dispose());
});
