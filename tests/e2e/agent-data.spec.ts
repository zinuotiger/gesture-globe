import { createServer } from 'node:http';
import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
import type { ExternalDataState } from '../../src/agent/index.ts';
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
let server: ReturnType<typeof createServer>;
let origin: string;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
  server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.startsWith('/weather')) {
      res.statusCode = 503;
      res.end('{"error":"fixture unavailable"}');
      return;
    }
    res.end(
      JSON.stringify({
        points: [
          { lat: 0, lon: 0 },
          { lat: 2, lon: 2 },
        ],
        distanceKm: 314,
        durationMinutes: 200,
        observedAt: '2026-09-27T00:00:00Z',
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected loopback server');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fixture?.close();
});
test('explicit loopback data reaches Geo route through M06; weather HTTP failure remains visible in result', async ({
  page,
}) => {
  await page.goto(
    fixture.origin +
      '/tests/fixtures/agent.html?route=' +
      encodeURIComponent(origin + '/route') +
      '&weather=' +
      encodeURIComponent(origin + '/weather'),
  );
  const route = await page.evaluate(() =>
    window.agentFixture.execute({
      name: 'drawRoute',
      args: { from: { lat: 0, lon: 0 }, to: { lat: 2, lon: 2 } },
    }),
  );
  expect(route.status).toBe('SUCCEEDED');
  const data = await page.evaluate(() =>
    (
      window.agentFixture as typeof window.agentFixture & {
        data(): ExternalDataState;
      }
    ).data(),
  );
  expect(data.source).toBe(origin + '/route');
  expect(data.data?.kind).toBe('route');
  expect(Date.parse(data.fetchedAt!)).not.toBeNaN();
  const weather = await page.evaluate(() =>
    window.agentFixture.execute({
      name: 'showWeather',
      args: { lat: 0, lon: 0 },
    }),
  );
  expect(weather.status).toBe('FAILED');
  const failed = await page.evaluate(() =>
    (
      window.agentFixture as typeof window.agentFixture & {
        data(): ExternalDataState;
      }
    ).data(),
  );
  expect(failed.error).toBe('HTTP_ERROR');
  expect(failed.data).toBeNull();
  expect(failed.source).toBe(origin + '/weather');
  await page.evaluate(() => window.agentFixture.dispose());
});
