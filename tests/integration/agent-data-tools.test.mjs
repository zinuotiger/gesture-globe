import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Scene } from 'three';
import { parseConfig } from '../../src/config/index.ts';
import { RouteOverlay } from '../../src/geo/index.ts';
import {
  ExternalDataAdapters,
  ToolRegistry,
  registerExternalDataTools,
  parseWeather,
  parseRoute,
} from '../../src/agent/index.ts';
import {
  CommandBus,
  createAgentPort,
  createInputAdapter,
} from '../../src/interaction/index.ts';
const observedAt = '2026-09-27T00:00:00Z';
const weather = { temperatureC: 20, condition: 'Clear', observedAt };
const route = {
  points: [
    { lat: 0, lon: 179 },
    { lat: 1, lon: -179 },
  ],
  distanceKm: 250,
  durationMinutes: 180,
  observedAt,
};
const signal = () => new globalThis.AbortController().signal;
const response = (data) => ({
  ok: true,
  data,
  source: 'https://example.invalid/data',
  fetchedAt: observedAt,
});
test('weather and route are validated/sourced; actual Geo overlay only receives M06 accepted route', async () => {
  const config = parseConfig({ features: { agent: true } });
  const scene = new Scene();
  const overlay = new RouteOverlay(scene, config);
  const bus = new CommandBus(
    config,
    () => 100,
    () => ({ distance: 3 }),
    () => true,
    { onRoute: (action) => overlay.setPoints(action.points) },
  );
  const port = createAgentPort(bus, () => ({}));
  const registry = new ToolRegistry(config);
  const adapter = new ExternalDataAdapters(
    {
      weather: { request: async () => response(weather) },
      route: { request: async () => response(route) },
    },
    config,
  );
  registerExternalDataTools(registry, adapter, port, () => 100);
  assert.equal(
    (await registry.execute({ name: 'showWeather', args: { lat: 0, lon: 0 } }))
      .status,
    'SUCCEEDED',
  );
  assert.equal(adapter.getState().source, 'https://example.invalid/data');
  assert.equal(adapter.getState().data.temperatureC, 20);
  assert.equal(
    (
      await registry.execute({
        name: 'drawRoute',
        args: { from: route.points[0], to: route.points[1] },
      })
    ).status,
    'SUCCEEDED',
  );
  const line = scene.getObjectByName('external-route-overlay');
  assert.ok(line.visible);
  const position = line.geometry.getAttribute('position');
  assert.ok(
    position.count >= 3 && position.count <= config.agent.maxRouteRenderPoints,
  );
  for (let i = 0; i < position.count; i++)
    assert.ok(
      Math.hypot(position.getX(i), position.getY(i), position.getZ(i)) >
        config.globe.earthRadius,
    );
  const oldGeometry = line.geometry;
  createInputAdapter('mouse', bus, () => 100, 'test').send('ROTATE', 'START', {
    yaw: 0,
    pitch: 0,
    dt: 0,
  });
  assert.equal(
    (
      await registry.execute({
        name: 'drawRoute',
        args: { from: route.points[0], to: route.points[1] },
      })
    ).status,
    'FAILED',
  );
  assert.equal(adapter.getState().error, 'DISPATCH_REJECTED');
  assert.equal(line.geometry, oldGeometry);
  overlay.dispose();
  bus.dispose();
  assert.equal(scene.children.length, 0);
});
test('invalid, unconfigured, failed and cancelled data never fabricates weather or route', async () => {
  for (const value of [
    { ...weather, temperatureC: Infinity },
    { ...weather, condition: '<img>' },
    { ...weather, observedAt: 'yesterday' },
  ])
    assert.throws(() => parseWeather(value));
  for (const value of [
    { ...route, points: [] },
    { ...route, distanceKm: -1 },
    {
      ...route,
      points: [
        { lat: 91, lon: 0 },
        { lat: 0, lon: 0 },
      ],
    },
  ])
    assert.throws(() => parseRoute(value));
  const call = { name: 'showWeather', args: { lat: 0, lon: 0 } };
  const absent = await new ExternalDataAdapters().load(call, signal(), () => {
    throw new Error('must not draw');
  });
  assert.equal(absent.error, 'UNCONFIGURED');
  assert.equal(absent.data, null);
  const failed = await new ExternalDataAdapters({
    weather: {
      request: async () => ({
        ok: false,
        error: 'RATE_LIMITED',
        source: 'https://example.invalid',
        fetchedAt: observedAt,
      }),
    },
  }).load(call, signal(), () => true);
  assert.equal(failed.error, 'RATE_LIMITED');
  assert.equal(failed.data, null);
  let resolve;
  const adapter = new ExternalDataAdapters({
    route: {
      request: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
  });
  let draws = 0;
  const pending = adapter.load(
    { name: 'drawRoute', args: { from: route.points[0], to: route.points[1] } },
    signal(),
    () => {
      draws++;
      return true;
    },
  );
  adapter.cancel();
  resolve(response(route));
  assert.equal((await pending).status, 'CANCELLED');
  assert.equal(draws, 0);
});
