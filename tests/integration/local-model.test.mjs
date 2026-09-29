import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { digest, verifyAssets } from '../../scripts/asset-policy.mjs';

test('Vite local development serves the integrity-checked external model', async () => {
  const started = performance.now();
  const mark = (stage) =>
    process.stdout.write(
      `LOCAL_MODEL_STAGE ${stage} elapsedMs=${Math.round(performance.now() - started)}\n`,
    );
  const manifest = await verifyAssets(process.cwd());
  mark('assets-verified');
  const entry = manifest.entries.find((asset) => asset.id === 'gesture-model');
  const server = await createServer({
    // This test requests only a public binary; dependency compilation is
    // exercised by browser tests and must not race this file-serving test.
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0 },
  });
  mark('server-created');
  try {
    await server.listen();
    mark('listening');
    const address = server.httpServer.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/models/gesture_recognizer.task`,
    );
    mark('headers-received');
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    mark('body-received');
    assert.equal(bytes.length, entry.sizeBytes);
    assert.equal(digest(bytes), entry.sha256);
  } finally {
    await server.close();
    mark('closed');
  }
});
