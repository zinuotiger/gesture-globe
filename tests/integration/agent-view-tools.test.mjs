import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseConfig } from '../../src/config/index.ts';
import { ToolRegistry, registerViewTools } from '../../src/agent/index.ts';
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

function fixture(enabled = true) {
  const config = parseConfig({ features: { agent: enabled } });
  const rig = new CameraRig(config),
    transition = new TransitionController(rig, config);
  const executor = new CommandExecutor(rig, config, transition);
  let now = 100;
  const selections = [],
    commands = [];
  const bus = new CommandBus(
    config,
    () => now,
    () => executor.getViewState(),
    (command) => {
      commands.push(command);
      return executor.execute(command, now);
    },
    {
      onSelection: (action) => {
        selections.push(action);
        return true;
      },
    },
  );
  const port = createAgentPort(bus, () => executor.getViewState());
  const registry = new ToolRegistry(config);
  registerViewTools(registry, port, () => now);
  return {
    config,
    rig,
    transition,
    executor,
    bus,
    port,
    registry,
    selections,
    commands,
    set(value) {
      now = value;
    },
    manual: createInputAdapter('mouse', bus, () => now, 'manual'),
  };
}
test('agent focus/reset/select traverse actual bus and user preempts the real transition', async () => {
  const f = fixture();
  assert.equal(
    (
      await f.registry.execute({
        name: 'focusLocation',
        args: { lat: 10, lon: 20 },
      })
    ).status,
    'SUCCEEDED',
  );
  assert.equal(f.transition.kind, 'FOCUS');
  f.transition.update(150);
  const partial = f.rig.getView();
  f.set(160);
  assert.equal(
    f.manual.send('ROTATE', 'START', { yaw: 0, pitch: 0, dt: 0 }).accepted,
    true,
  );
  assert.equal(f.transition.kind, 'IDLE');
  f.transition.update(1000);
  assert.deepEqual(f.rig.getView(), partial);
  assert.equal(
    (await f.registry.execute({ name: 'resetView', args: {} })).status,
    'REJECTED',
  );
  f.set(1000);
  assert.equal(
    (await f.registry.execute({ name: 'resetView', args: {} })).status,
    'SUCCEEDED',
  );
  assert.equal(f.commands.at(-1).type, 'RESET_VIEW');
  f.port.cancel();
  assert.equal(f.bus.getState().owner, null);
  assert.equal(f.transition.kind, 'IDLE');
  f.set(1001);
  assert.equal(
    (
      await f.registry.execute({
        name: 'selectGeo',
        args: { lat: 39.9, lon: 116.4 },
      })
    ).status,
    'SUCCEEDED',
  );
  assert.equal(f.selections.at(-1).type, 'SELECT_GEO');
  assert.equal(f.selections.at(-1).lat, 39.9);
  f.bus.dispose();
  assert.equal(
    (await f.registry.execute({ name: 'resetView', args: {} })).status,
    'REJECTED',
  );
});
test('narrow agent port refuses source spoofing; invalid/disabled calls never select', async () => {
  const f = fixture(false);
  assert.equal(
    (await f.registry.execute({ name: 'selectGeo', args: { lat: 0, lon: 0 } }))
      .code,
    'DISABLED',
  );
  assert.equal(
    f.port.dispatch({
      schemaVersion: 1,
      id: 'spoof',
      source: 'mouse',
      kind: 'RESET',
      phase: 'TRIGGER',
      timestampMs: 100,
      payload: {},
    }).accepted,
    false,
  );
  assert.equal(f.selections.length, 0);
  assert.equal(f.commands.length, 0);
  f.bus.dispose();
});
