import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  ToolRegistry,
  parseToolCall,
  toolNames,
  toolSchemas,
} from '../../src/agent/index.ts';
import { parseConfig } from '../../src/config/index.ts';

test('agent defaults closed; only explicit whitelist registration executes', async () => {
  let calls = 0;
  const executor = async (call) => {
    calls++;
    assert.ok(Object.isFrozen(call.args));
    return { status: 'SUCCEEDED', code: 'OK' };
  };
  const disabled = new ToolRegistry();
  disabled.register('resetView', executor);
  assert.deepEqual(disabled.available(), []);
  assert.equal(
    (await disabled.execute({ name: 'resetView', args: {} })).code,
    'DISABLED',
  );
  assert.equal(calls, 0);
  const registry = new ToolRegistry(parseConfig({ features: { agent: true } }));
  registry.register('resetView', executor);
  assert.throws(() => registry.register('eval', executor));
  assert.throws(() => registry.register('resetView', executor));
  assert.equal(
    (await registry.execute({ name: 'resetView', args: {} })).status,
    'SUCCEEDED',
  );
  assert.equal(calls, 1);
  assert.equal(
    (await registry.execute({ name: 'showWeather', args: { lat: 0, lon: 0 } }))
      .code,
    'UNAVAILABLE',
  );
  assert.deepEqual(Object.keys(toolSchemas), toolNames);
});
test('tool schemas reject unknown, malformed, prototype, accessor and unbounded input', () => {
  for (const value of [
    null,
    [],
    { name: 'eval', args: {} },
    { name: 'resetView', args: {}, script: 'x' },
    { name: 'resetView', args: { script: 'x' } },
    {
      get name() {
        throw new Error('must not invoke');
      },
      args: {},
    },
    { name: 'focusLocation', args: { lat: 91, lon: 0 } },
    { name: 'focusLocation', args: { lat: NaN, lon: 0 } },
    { name: 'selectGeo', args: { lat: 0, lon: Infinity } },
    { name: 'showWeather', args: { lat: '0', lon: 0 } },
    { name: 'resolveLocation', args: { query: 'x'.repeat(257) } },
    { name: 'resolveLocation', args: { query: ' ' } },
    {
      name: 'drawRoute',
      args: { from: { lat: 0, lon: 0 }, to: { lat: 0, lon: -181 } },
    },
    { name: 'resetView', args: new Date() },
  ])
    assert.throws(() => parseToolCall(value));
  for (const name of ['focusLocation', 'selectGeo', 'showWeather'])
    assert.deepEqual(
      parseToolCall({ name, args: { lat: -90, lon: 180 } }).args,
      { lat: -90, lon: 180 },
    );
  assert.equal(
    parseToolCall({ name: 'resolveLocation', args: { query: ' 北京 ' } }).args
      .query,
    '北京',
  );
  assert.ok(
    parseToolCall({
      name: 'drawRoute',
      args: { from: { lat: 0, lon: 0 }, to: { lat: 1, lon: 1 } },
    }),
  );
});
test('invalid and cancelled calls never invoke executor; errors are redacted', async () => {
  const registry = new ToolRegistry(parseConfig({ features: { agent: true } }));
  let calls = 0;
  registry.register('resetView', async () => {
    calls++;
    throw new Error('secret upstream details');
  });
  assert.equal(
    (await registry.execute({ name: 'unknown', args: {} })).code,
    'INVALID_TOOL',
  );
  const controller = new globalThis.AbortController();
  controller.abort();
  assert.equal(
    (await registry.execute({ name: 'resetView', args: {} }, controller.signal))
      .status,
    'CANCELLED',
  );
  assert.equal(calls, 0);
  assert.deepEqual(await registry.execute({ name: 'resetView', args: {} }), {
    status: 'FAILED',
    code: 'EXECUTION_FAILED',
  });
});
