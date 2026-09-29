import { createServer } from 'vite';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

export async function startFixtureServer() {
  const parent = path.resolve('node_modules/.cache');
  await mkdir(parent, { recursive: true });
  const cache = await mkdtemp(path.join(parent, 'geo-vite-'));
  const server = await createServer({
    cacheDir: cache,
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected fixture TCP server');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      // Vite may still be optimizing a late Worker import after its page closes.
      // Await the real processing barriers before deleting this fixture's cache.
      for (const environment of Object.values(server.environments)) {
        await environment.waitForRequestsIdle();
        const optimizer = environment.depsOptimizer;
        await optimizer?.scanProcessing;
        const seen = new Set<Promise<void>>();
        for (;;) {
          const pending = Object.values(optimizer?.metadata.discovered ?? {})
            .map((info) => info.processing)
            .filter(
              (promise): promise is Promise<void> =>
                !!promise && !seen.has(promise),
            );
          if (!pending.length) break;
          pending.forEach((promise) => seen.add(promise));
          await Promise.all(pending);
          await environment.waitForRequestsIdle();
        }
      }
      await server.close();
      if (cache.startsWith(parent + path.sep))
        await rm(cache, { recursive: true, force: true });
    },
  };
}
