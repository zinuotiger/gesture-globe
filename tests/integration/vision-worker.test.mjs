import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import { test } from 'vitest';
import { createServer, build } from 'vite';
import { visionAssetUrls } from '../../src/config/index.ts';

test('actual local MediaPipe model loads in a dedicated worker; model and WASM 404 fail explicitly', async () => {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(
    'node_modules/.cache/ms-playwright',
  );
  const { chromium } = await import('@playwright/test');
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(
      `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/vision-worker-harness.html`,
    );
    const results = await page.evaluate(async (assets) => {
      const run = (patch, entry, infer = false) =>
        new Promise((resolve, reject) => {
          const worker = entry
            ? new globalThis.Worker(
                '/models/vision-worker-bootstrap.js?entry=' +
                  encodeURIComponent(
                    new globalThis.URL(entry, globalThis.location.href).href,
                  ),
              )
            : globalThis.createTestVisionWorker();
          const timer = globalThis.setTimeout(() => {
            worker.terminate();
            reject(new Error('worker initialization exceeded 12s'));
          }, 12000);
          worker.onerror = (e) => {
            globalThis.clearTimeout(timer);
            worker.terminate();
            reject(new Error(e.message));
          };
          worker.onmessage = async (e) => {
            if (infer && e.data.type === 'READY') {
              try {
                const canvas = new globalThis.OffscreenCanvas(256, 256);
                canvas.getContext('2d').fillRect(0, 0, 256, 256);
                const bitmap = await globalThis.createImageBitmap(canvas);
                worker.postMessage(
                  {
                    type: 'PROCESS_FRAME',
                    schemaVersion: 1,
                    sessionId: 'actual-sdk-test',
                    frameId: 0,
                    captureTimeMs:
                      globalThis.performance.timeOrigin +
                      globalThis.performance.now(),
                    bitmap,
                  },
                  [bitmap],
                );
                if (bitmap.width !== 0)
                  throw new Error('Inference bitmap was not transferred');
              } catch (error) {
                globalThis.clearTimeout(timer);
                worker.terminate();
                reject(error);
              }
              return;
            }
            globalThis.clearTimeout(timer);
            worker.terminate();
            resolve(e.data);
          };
          worker.postMessage({
            type: 'INIT',
            schemaVersion: 1,
            sessionId: 'actual-sdk-test',
            assets: { ...assets, ...patch },
            options: {
              runningMode: 'VIDEO',
              numHands: 1,
              worldLandmarks: false,
            },
          });
        });
      globalThis.runModelTest = run;
      return [
        await run({}),
        await run({ modelUrl: '/models/not-present.task' }),
        await run({ wasmRoot: '/models/not-present' }),
      ];
    }, visionAssetUrls());
    assert.equal(results[0].type, 'READY', JSON.stringify(results));
    assert.equal(results[1].error.code, 'E-VIS-001');
    assert.equal(results[2].error.code, 'E-VIS-002');
    // Use the actual Vite SPA fallback body, not a fabricated successful response.
    const fallback = await fetch(
      `http://127.0.0.1:${server.httpServer.address().port}/models/not-present.task`,
    );
    assert.equal(fallback.status, 200);
    assert.match(fallback.headers.get('content-type'), /text\/html/);
    const body = await fallback.text();
    await page.route('**/models/gesture_recognizer.task', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body }),
    );
    const invalid = await page.evaluate(() => globalThis.runModelTest({}));
    assert.equal(invalid.error.code, 'E-VIS-001');
    assert.equal(invalid.error.technical.name, 'HTML');
    await page.unroute('**/models/gesture_recognizer.task');
    const built = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        copyPublicDir: false,
        lib: {
          entry: path.resolve('src/vision/vision.worker.ts'),
          name: 'VisionWorker',
          formats: ['iife'],
        },
      },
    });
    const output = (Array.isArray(built) ? built[0] : built).output.find(
      (chunk) => chunk.type === 'chunk',
    );
    await page.route('**/assets/vision.worker-fixture.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: output.code,
      }),
    );
    const production = await page.evaluate(() =>
      globalThis.runModelTest({}, '/assets/vision.worker-fixture.js'),
    );
    assert.equal(production.type, 'READY', JSON.stringify(production));
    for (const entry of [undefined, '/assets/vision.worker-fixture.js']) {
      const inference = await page.evaluate(
        (entry) => globalThis.runModelTest({}, entry, true),
        entry,
      );
      assert.equal(inference.type, 'FRAME_RESULT', JSON.stringify(inference));
      assert.deepEqual(inference.frame.hands, []);
      assert.deepEqual(inference.frame.source, { width: 256, height: 256 });
      assert.ok(inference.frame.resultTimeMs >= inference.frame.captureTimeMs);
      assert.ok(
        Number.isFinite(inference.frame.inferenceMs) &&
          inference.frame.inferenceMs >= 0,
      );
    }
    const lifecycle = await page.evaluate(async () => {
      const client = globalThis.createTestVisionClient();
      const first = await client.start({ sessionId: 'real-client-1' });
      const active = client.getState().phase;
      const heartbeat = new Promise((resolve) => {
        const unsubscribe = client.onHeartbeat((nonce) => {
          unsubscribe();
          resolve(nonce);
        });
      });
      client.ping(42);
      const heartbeatNonce = await heartbeat;
      client.pause('INTEGRATION_CHECK');
      const paused = client.getState().phase;
      const resumed = new Promise((resolve) => {
        const unsubscribe = client.subscribe((state) => {
          if (state.phase === 'READY') {
            unsubscribe();
            resolve(state.phase);
          }
        });
      });
      client.resume();
      const resumedPhase = await resumed;
      client.stop();
      const stopped = client.getState().phase;
      const second = await client.start({ sessionId: 'real-client-2' });
      client.dispose();
      return {
        first: first.ok,
        active,
        heartbeatNonce,
        paused,
        resumed: resumedPhase,
        stopped,
        second: second.ok,
        disposed: client.getState().phase,
      };
    });
    assert.deepEqual(lifecycle, {
      first: true,
      active: 'READY',
      heartbeatNonce: 42,
      paused: 'PAUSED',
      resumed: 'READY',
      stopped: 'IDLE',
      second: true,
      disposed: 'DISPOSED',
    });
  } finally {
    await browser?.close();
    await server.close();
  }
}, 45000);
