import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseConfig } from '../../src/config/index.ts';
import {
  AgentActionCoordinator,
  ToolRegistry,
  registerViewTools,
  ExternalDataAdapters,
  registerExternalDataTools,
} from '../../src/agent/index.ts';
import {
  CommandBus,
  createAgentPort,
  createInputAdapter,
} from '../../src/interaction/index.ts';
import {
  CameraRig,
  CommandExecutor,
  TransitionController,
} from '../../src/globe/index.ts';

function fixture() {
  const config = parseConfig({ features: { agent: true } });
  let now = 100;
  const rig = new CameraRig(config),
    transitions = new TransitionController(rig, config),
    executor = new CommandExecutor(rig, config, transitions);
  const bus = new CommandBus(
    config,
    () => now,
    () => executor.getViewState(),
    (command) => executor.execute(command, now),
  );
  const port = createAgentPort(bus, () => executor.getViewState()),
    registry = new ToolRegistry(config);
  registerViewTools(registry, port, () => now);
  const coordinator = new AgentActionCoordinator(
    registry,
    port,
    config,
    undefined,
    undefined,
    () => now,
  );
  return {
    config,
    rig,
    transitions,
    executor,
    bus,
    port,
    registry,
    coordinator,
    step() {
      now += 50;
      bus.flush();
      executor.update(now);
      coordinator.tick();
    },
    manual: createInputAdapter('mouse', bus, () => now, 'manual'),
    finish() {
      for (
        let i = 0;
        i < 50 && coordinator.snapshot().status === 'RUNNING';
        i++
      )
        this.step();
    },
  };
}
test('view action renews only its active transition, completes, releases and undoes exact prior view', async () => {
  const f = fixture(),
    before = f.port.readView();
  await f.coordinator.run({
    name: 'focusLocation',
    args: { lat: 20, lon: 80 },
  });
  assert.equal(f.coordinator.snapshot().status, 'RUNNING');
  f.finish();
  assert.equal(f.coordinator.snapshot().status, 'SUCCEEDED');
  assert.equal(f.bus.getState().owner, null);
  assert.ok(f.coordinator.undo());
  f.finish();
  const restored = f.port.readView();
  for (const field of ['azimuth', 'polar', 'distance'])
    assert.ok(Math.abs(restored[field] - before[field]) < 1e-9, field);
  assert.equal(restored.autoRotate, before.autoRotate);
  assert.equal(f.coordinator.snapshot().canUndo, false);
  assert.equal(f.bus.getState().owner, null);
  f.coordinator.dispose();
  f.bus.dispose();
});
test('cancel, user preemption, supersession and disposal leave no Agent movement lease', async () => {
  const f = fixture();
  await f.coordinator.run({
    name: 'focusLocation',
    args: { lat: 20, lon: 80 },
  });
  f.step();
  f.coordinator.cancel();
  assert.equal(f.transitions.kind, 'IDLE');
  assert.equal(f.bus.getState().owner, null);
  assert.equal(f.coordinator.snapshot().status, 'CANCELLED');
  await f.coordinator.run({ name: 'resetView', args: {} });
  f.manual.send('ROTATE', 'START', { yaw: 0, pitch: 0, dt: 0 });
  assert.equal(f.coordinator.snapshot().status, 'CANCELLED');
  assert.equal(f.bus.getState().owner, 'mouse');
  f.coordinator.cancel();
  assert.equal(f.bus.getState().owner, 'mouse');
  f.coordinator.dispose();
  assert.equal(
    (await f.coordinator.run({ name: 'resetView', args: {} })).code,
    'DISABLED',
  );
  f.bus.dispose();
});
test('late external completion cannot overwrite cancelled action; redacted event buffer is bounded', async () => {
  const f = fixture();
  let resolve;
  const external = new ExternalDataAdapters(
    {
      weather: {
        request: () =>
          new Promise((done) => {
            resolve = done;
          }),
      },
    },
    f.config,
  );
  registerExternalDataTools(f.registry, external, f.port, () => 100);
  const coordinator = new AgentActionCoordinator(
    f.registry,
    f.port,
    f.config,
    undefined,
    external,
    () => 100,
  );
  const pending = coordinator.run({
    name: 'showWeather',
    args: { lat: 0, lon: 0 },
  });
  coordinator.cancel();
  resolve({
    ok: true,
    data: {
      temperatureC: 20,
      condition: 'fixture',
      observedAt: '2026-09-27T00:00:00Z',
    },
    source: 'https://example.invalid',
    fetchedAt: '2026-09-27T00:00:00Z',
  });
  assert.equal((await pending).status, 'CANCELLED');
  assert.equal(coordinator.snapshot().status, 'CANCELLED');
  assert.equal(f.bus.getState().owner, null);
  coordinator.dispose();
  f.transitions.setReducedMotion(true);
  for (let index = 0; index < f.config.diagnostics.eventCapacity + 1; index++)
    await f.coordinator.run({ name: 'resetView', args: {} });
  const events = f.coordinator.getEvents();
  assert.equal(events.length, f.config.diagnostics.eventCapacity);
  assert.ok(
    events.every(
      (event) => Object.keys(event).sort().join(',') === 'atMs,id,status,tool',
    ),
  );
  assert.equal(JSON.stringify(events).includes('lat'), false);
  f.coordinator.dispose();
  f.bus.dispose();
});
