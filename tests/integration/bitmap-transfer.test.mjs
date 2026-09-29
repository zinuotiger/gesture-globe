import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';
import { test } from 'vitest';
test('actual browser ImageBitmap transfer detaches sender and closes worker objects across 1200 synthetic success/failure frames', async () => {
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
      `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/bitmap-harness.html`,
    );
    const report = await page.evaluate(() =>
      globalThis.runBitmapOwnership({ frames: 1200 }),
    );
    assert.equal(report.frames, 1200);
    assert.equal(report.metrics.closed, 1200);
    assert.equal(report.metrics.active, 0);
    assert.equal(report.metrics.maximumActive, 1);
    assert.equal(report.metrics.failed, 71);
    assert.equal(report.realCamera, false);
  } finally {
    await browser?.close();
    await server.close();
  }
}, 20000);
