import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  GeocodingAdapter,
  ToolRegistry,
  registerGeocodingTool,
} from '../../src/agent/index.ts';
import { parseConfig } from '../../src/config/index.ts';
const signal = () => new globalThis.AbortController().signal;
const reply = (candidates) => ({
  ok: true,
  data: { candidates },
  source: 'https://example.invalid/geocode',
  fetchedAt: '2026-09-27T00:00:00Z',
});
const place = (id = 'a') => ({ id, label: 'Springfield', lat: 40, lon: -90 });
test('ambiguous and single geocoding candidates require current explicit confirmation', async () => {
  const adapter = new GeocodingAdapter({
    request: async () => reply([place(), place('b')]),
  });
  const result = await adapter.search('Springfield', signal());
  assert.equal(result.status, 'AWAITING_CONFIRMATION');
  assert.equal(result.candidates.length, 2);
  assert.equal(adapter.confirm(result.requestId - 1, 'a'), undefined);
  assert.equal(adapter.confirm(result.requestId, 'unknown'), undefined);
  assert.deepEqual(adapter.confirm(result.requestId, 'b'), {
    lat: 40,
    lon: -90,
  });
  assert.equal(adapter.confirm(result.requestId, 'b'), undefined);
  const single = new GeocodingAdapter({
    request: async () => reply([place()]),
  });
  assert.equal(
    (await single.search('city', signal())).status,
    'AWAITING_CONFIRMATION',
  );
});
test('missing, empty and invalid upstream results are explicit with no invented coordinates', async () => {
  const registry = new ToolRegistry(parseConfig({ features: { agent: true } }));
  const absent = new GeocodingAdapter();
  registerGeocodingTool(registry, absent);
  assert.equal(
    (
      await registry.execute({
        name: 'resolveLocation',
        args: { query: 'city' },
      })
    ).code,
    'UNAVAILABLE',
  );
  assert.equal(absent.getState().error, 'UNCONFIGURED');
  const empty = new GeocodingAdapter({ request: async () => reply([]) });
  assert.equal((await empty.search('city', signal())).status, 'EMPTY');
  for (const candidates of [
    [{ ...place(), label: '<script>x</script>' }],
    [place(), place()],
    [{ ...place(), lat: 91 }],
    Array.from({ length: 9 }, (_, i) => place(String(i))),
  ]) {
    const adapter = new GeocodingAdapter({
      request: async () => reply(candidates),
    });
    assert.equal((await adapter.search('city', signal())).status, 'FAILED');
    assert.deepEqual(adapter.getState().candidates, []);
  }
});
test('cancel and supersession invalidate old confirmation and late response', async () => {
  const pending = [];
  const adapter = new GeocodingAdapter({
    request: () => new Promise((resolve) => pending.push(resolve)),
  });
  const first = adapter.search('first', signal());
  const second = adapter.search('second', signal());
  pending[1](reply([place('second')]));
  await second;
  const id = adapter.getState().requestId;
  pending[0](reply([place('first')]));
  assert.equal((await first).status, 'CANCELLED');
  assert.equal(adapter.getState().candidates[0].id, 'second');
  adapter.cancel();
  assert.equal(adapter.confirm(id, 'second'), undefined);
  assert.equal(adapter.getState().status, 'CANCELLED');
});
