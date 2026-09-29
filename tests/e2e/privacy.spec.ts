import { writeFile } from 'node:fs/promises';
import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
declare global {
  interface Window {
    privacyAudit: {
      requests: number;
      audioRequested: boolean;
      tracks: MediaStreamTrack[];
      workersStarted: number;
      workersEnded: number;
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
test('real local inference on explicit synthetic video sends no frames, persists only preferences, and releases resources', async ({
  page,
  context,
}, testInfo) => {
  const network = {
    requests: 0,
    outsideOrigin: 0,
    nonGet: 0,
    bodyBytes: 0,
    socketUnexpected: 0,
  };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  context.on('request', (request) => {
    network.requests++;
    const url = new URL(request.url());
    if (url.origin !== fixture.origin) network.outsideOrigin++;
    if (request.method() !== 'GET') network.nonGet++;
    network.bodyBytes += request.postDataBuffer()?.byteLength ?? 0;
  });
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).host !== new URL(fixture.origin).host)
      network.socketUnexpected++;
    socket.on('framesent', ({ payload }) => {
      // Vite's local development keepalive is the only permitted outbound socket data.
      if (payload !== 'ping' && payload !== '{"type":"ping"}')
        network.socketUnexpected++;
    });
  });
  await page.addInitScript(() => {
    window.privacyAudit = {
      requests: 0,
      audioRequested: false,
      tracks: [],
      workersStarted: 0,
      workersEnded: 0,
    };
    const Native = window.Worker;
    window.Worker = class extends Native {
      private ended = false;
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        window.privacyAudit.workersStarted++;
      }
      terminate() {
        if (!this.ended) {
          this.ended = true;
          window.privacyAudit.workersEnded++;
        }
        super.terminate();
      }
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async (constraints: MediaStreamConstraints) => {
        window.privacyAudit.requests++;
        window.privacyAudit.audioRequested ||= constraints.audio !== false;
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        canvas.getContext('2d')!.fillRect(0, 0, 160, 90);
        const stream = canvas.captureStream(1);
        window.privacyAudit.tracks.push(...stream.getTracks());
        return stream;
      },
    });
  });
  await page.goto(fixture.origin + '/tests/fixtures/error-harness.html');
  expect(await page.evaluate(() => window.privacyAudit.requests)).toBe(0);
  await page.getByRole('button', { name: '启用手势控制' }).click();
  await expect(page.locator('.gesture-feedback')).toHaveAttribute(
    'data-phase',
    'READY',
    { timeout: 15000 },
  );
  await expect
    .poll(() =>
      page.locator('.gesture-feedback').getAttribute('data-accepted-frames'),
    )
    .not.toBe('0');
  await page.getByRole('button', { name: '隐藏画面', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window.privacyAudit.tracks.filter((t) => t.readyState === 'live')
          .length,
    ),
  ).toBe(1);
  await page.locator('.settings-panel summary').click();
  await page.getByLabel('手势灵敏度', { exact: true }).fill('1.25');
  await page.getByLabel('手势灵敏度', { exact: true }).dispatchEvent('change');
  await page.keyboard.press('Escape');
  const storage = await page.evaluate(async () => ({
    local: Object.keys(localStorage).sort(),
    preferenceFields: Object.keys(
      JSON.parse(localStorage.getItem('gesture-globe.preferences.v1')!),
    ).sort(),
    session: Object.keys(sessionStorage),
    databases:
      typeof indexedDB.databases === 'function'
        ? (await indexedDB.databases()).length
        : null,
    caches: (await caches.keys()).length,
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  expect(storage.local).toEqual([
    'gesture-globe.onboarding.v1',
    'gesture-globe.preferences.v1',
  ]);
  expect(storage.preferenceFields).toEqual(
    [
      'autoRotate',
      'invertX',
      'invertY',
      'quality',
      'reducedMotion',
      'sensitivity',
      'showPreview',
      'showSkeleton',
      'storageVersion',
    ].sort(),
  );
  expect(storage.session).toEqual([]);
  expect(storage.databases).toBe(0);
  expect(storage.caches).toBe(0);
  expect(storage.serviceWorkers).toBe(0);
  await page.getByRole('button', { name: '关闭摄像头', exact: true }).click();
  await expect(page.locator('.gesture-feedback')).toHaveAttribute(
    'data-phase',
    'STOPPED',
  );
  const resources = await page.evaluate(() => ({
    permissionCalls: window.privacyAudit.requests,
    audioRequested: window.privacyAudit.audioRequested,
    totalTracks: window.privacyAudit.tracks.length,
    endedTracks: window.privacyAudit.tracks.filter(
      (t) => t.readyState === 'ended',
    ).length,
    workersStarted: window.privacyAudit.workersStarted,
    workersEnded: window.privacyAudit.workersEnded,
    videoDetached: document.querySelector('video')!.srcObject === null,
  }));
  expect(resources).toEqual({
    permissionCalls: 1,
    audioRequested: false,
    totalTracks: 1,
    endedTracks: 1,
    workersStarted: 1,
    workersEnded: 1,
    videoDetached: true,
  });
  await page.evaluate(() => window.errorFixture.dispose());
  expect(network.requests).toBeGreaterThan(0);
  expect(network).toMatchObject({
    outsideOrigin: 0,
    nonGet: 0,
    bodyBytes: 0,
    socketUnexpected: 0,
  });
  expect(errors).toEqual([]);
  await writeFile(
    testInfo.outputPath('privacy-automatic.json'),
    JSON.stringify(
      {
        task: 'TASK-706',
        source: 'SYNTHETIC_VIDEO_REAL_LOCAL_MODEL',
        automation: 'PASS',
        manual: 'NOT_RUN',
        network,
        storage,
        resources,
        physicalIndicator: 'NOT_OBSERVED',
      },
      null,
      2,
    ) + '\n',
  );
});
