import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createServer } from 'vite';

test('Vite serves the page and transforms the TypeScript composition entry', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  try {
    await server.listen();
    const address = server.httpServer.address();
    const origin = `http://127.0.0.1:${address.port}`;
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Gesture Globe · 手势地球/);
    const entry = await fetch(`${origin}/src/main.ts`);
    assert.equal(entry.status, 200);
    assert.match(await entry.text(), /bootstrapApp/);
  } finally {
    await server.close();
  }
});
