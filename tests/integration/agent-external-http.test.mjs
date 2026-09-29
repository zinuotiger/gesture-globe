import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'vitest';
import { ExternalJsonClient, GeocodingAdapter } from '../../src/agent/index.ts';
import { parseConfig } from '../../src/config/index.ts';

test('actual loopback HTTP validates geocoding, rate limit, body bound, timeout and cancellation', async () => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({
      url: req.url,
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
    });
    if (req.url.startsWith('/wait')) return;
    if (req.url.startsWith('/rate')) {
      res.writeHead(429);
      res.end();
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(
      req.url.startsWith('/large')
        ? JSON.stringify({ x: 'x'.repeat(2048) })
        : JSON.stringify({
            candidates: [{ id: 'x', label: '测试地点', lat: 1, lon: 2 }],
          }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const config = parseConfig({
    agent: { maxResponseBytes: 1024, requestTimeoutMs: 100 },
  });
  const controller = new globalThis.AbortController();
  try {
    const adapter = new GeocodingAdapter(
      new ExternalJsonClient(origin + '/geo', config),
    );
    const result = await adapter.search('重名地点', controller.signal);
    assert.equal(result.status, 'AWAITING_CONFIRMATION');
    assert.equal(result.source, origin + '/geo');
    assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
    assert.equal(
      new globalThis.URL(requests[0].url, origin).searchParams.get('q'),
      '重名地点',
    );
    for (const [route, error] of [
      ['/rate', 'RATE_LIMITED'],
      ['/large', 'INVALID_RESPONSE'],
      ['/wait', 'TIMEOUT'],
    ])
      assert.equal(
        (
          await new ExternalJsonClient(origin + route, config).request(
            {},
            controller.signal,
          )
        ).error,
        error,
      );
    controller.abort();
    const count = requests.length;
    assert.equal(
      (
        await new ExternalJsonClient(origin + '/geo').request(
          {},
          controller.signal,
        )
      ).error,
      'CANCELLED',
    );
    assert.equal(requests.length, count);
    assert.ok(requests.every((req) => !req.cookie && !req.authorization));
    for (const endpoint of [
      'http://remote.invalid',
      'https://user:password@example.invalid',
      'https://example.invalid?key=secret',
      'javascript:alert(1)',
    ])
      assert.throws(() => new ExternalJsonClient(endpoint));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
