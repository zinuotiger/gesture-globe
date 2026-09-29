import assert from 'node:assert/strict';
import { test } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import {
  CameraRig,
  CommandExecutor,
  TransitionController,
} from '../../src/globe/index.ts';
import { CommandBus, createInputAdapter } from '../../src/interaction/index.ts';

test('explicit autorotate remains enabled after input lease expires and manual motion stops it', () => {
  let now = 0;
  const rig = new CameraRig(defaults);
  const executor = new CommandExecutor(rig, defaults);
  const bus = new CommandBus(
    defaults,
    () => now,
    () => executor.getViewState(),
    (c) => executor.execute(c, now),
  );
  const input = createInputAdapter('ui', bus, () => now, 'settings');
  assert.equal(
    input.send('SET_AUTOROTATE', 'TRIGGER', { enabled: true }).accepted,
    true,
  );
  assert.equal(executor.getViewState().autoRotate, true);
  now = defaults.interaction.mouseLockMs + 1;
  bus.flush();
  assert.equal(executor.getViewState().autoRotate, true);
  assert.equal(
    input.send('ROTATE', 'UPDATE', { yaw: 0.01, pitch: 0, dt: 1 / 60 })
      .accepted,
    true,
  );
  bus.flush();
  assert.equal(executor.getViewState().autoRotate, false);
});

test('reduced motion cancels an active transition and makes future reset/focus immediate', () => {
  const rig = new CameraRig(defaults);
  const transition = new TransitionController(rig, defaults);
  const executor = new CommandExecutor(rig, defaults, transition);
  rig.setView({ azimuth: 1, polar: 1, distance: 2 });
  executor.execute(
    { schemaVersion: 1, id: 'reset1', type: 'RESET_VIEW', at: 0 },
    0,
  );
  executor.update(100);
  executor.setReducedMotion(true);
  assert.equal(executor.getViewState().transition, 'IDLE');
  executor.execute(
    { schemaVersion: 1, id: 'reset2', type: 'RESET_VIEW', at: 100 },
    100,
  );
  assert.equal(executor.getViewState().transition, 'IDLE');
  assert.equal(rig.getView().distance, defaults.globe.initialDistance);
  executor.execute(
    {
      schemaVersion: 1,
      id: 'focus',
      type: 'FOCUS_GEO',
      lat: 0,
      lon: 0,
      at: 100,
    },
    100,
  );
  assert.equal(executor.getViewState().transition, 'IDLE');
  assert.ok(Math.abs(rig.getPosition().z) < 1e-9);
  executor.execute(
    {
      schemaVersion: 1,
      id: 'auto',
      type: 'SET_AUTOROTATE',
      enabled: true,
      at: 100,
    },
    100,
  );
  assert.equal(executor.getViewState().autoRotate, false);
  executor.setReducedMotion(false);
  executor.execute(
    { schemaVersion: 1, id: 'reset3', type: 'RESET_VIEW', at: 100 },
    100,
  );
  assert.equal(executor.getViewState().transition, 'RESET');
});
