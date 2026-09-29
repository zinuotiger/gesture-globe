import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  CameraRig,
  CommandExecutor,
  isGlobeCommand,
} from '../../src/globe/index.ts';
import { parseConfig } from '../../src/config/index.ts';
const defaults = parseConfig({
  globe: { initialAzimuth: 0, initialPolar: Math.PI / 2 },
});
const command = (type, fields = {}) => ({
  schemaVersion: 1,
  id: type,
  at: 10,
  type,
  ...fields,
});
test('real commands rotate and zoom without camera, reject repeats and stale/future envelopes', () => {
  const rig = new CameraRig(defaults);
  const executor = new CommandExecutor(rig, defaults);
  assert.equal(
    executor.execute(
      command('ROTATE', { yaw: 0.1, pitch: 0.05, dt: 0.05 }),
      10,
    ),
    true,
  );
  assert.ok(Math.abs(rig.getView().azimuth - 0.1) < 1e-10);
  assert.equal(
    executor.execute(command('ZOOM', { delta: -0.05, dt: 0.05 }), 20),
    true,
  );
  assert.equal(rig.getView().distance, 2.95);
  const before = rig.getView();
  assert.equal(
    executor.execute(command('ROTATE', { yaw: 0.1, pitch: 0, dt: 0.05 }), 20),
    false,
  );
  assert.equal(
    executor.execute(command('ZOOM', { id: 'stale', delta: 1, dt: 0.1 }), 1000),
    false,
  );
  assert.equal(
    executor.execute(command('ZOOM', { id: 'future', delta: 1, dt: 0.1 }), 0),
    false,
  );
  assert.equal(rig.getView(), before);
  executor.dispose();
  executor.dispose();
  assert.equal(
    executor.execute(command('SET_AUTOROTATE', { enabled: true }), 10),
    false,
  );
});
test('malformed, unknown, accessor and nonfinite commands are rejected without executing accessors', () => {
  for (const value of [
    null,
    {},
    command('UNKNOWN'),
    command('ROTATE', { yaw: NaN, pitch: 0, dt: 0.1 }),
    command('ROTATE', { yaw: 1, pitch: 0, dt: 0 }),
    command('ZOOM', { delta: Infinity, dt: 0.1 }),
    command('FOCUS_GEO', { lat: 91, lon: 0 }),
    command('FOCUS_GEO', { lat: 0, lon: 181 }),
    command('RESET_VIEW', { durationMs: -1 }),
    command('CANCEL_TRANSITION', { extra: true }),
    command('SET_AUTOROTATE', { enabled: 'true' }),
    command('CANCEL_TRANSITION', { schemaVersion: 2 }),
    {
      get type() {
        throw new Error('getter executed');
      },
    },
  ])
    assert.equal(isGlobeCommand(value), false);
});
test('auto rotation uses real elapsed time, is bounded after a gap, and user input stops it', () => {
  const rig = new CameraRig(defaults);
  const executor = new CommandExecutor(rig, defaults);
  executor.update(0);
  executor.update(100);
  const moved = rig.getView().azimuth;
  assert.ok(Math.abs(moved - 0.004) < 1e-10);
  executor.update(10000);
  assert.ok(Math.abs(rig.getView().azimuth - 0.008) < 1e-10);
  executor.onUserInput();
  const before = rig.getView();
  executor.update(10100);
  assert.equal(rig.getView(), before);
  assert.equal(executor.getViewState().autoRotate, false);
});
test('transition commands route through the explicit driver; absent driver cannot claim success', () => {
  const rig = new CameraRig(defaults);
  const calls = [];
  const driver = {
    kind: 'IDLE',
    start(c, at) {
      calls.push([c.type, at]);
      return true;
    },
    cancel() {
      calls.push('cancel');
    },
    update(at) {
      calls.push(at);
    },
  };
  const executor = new CommandExecutor(rig, defaults, driver);
  assert.equal(executor.execute(command('RESET_VIEW'), 10), true);
  assert.equal(
    executor.execute(command('FOCUS_GEO', { lat: 30, lon: 120 }), 10),
    true,
  );
  assert.equal(executor.execute(command('CANCEL_TRANSITION'), 10), true);
  assert.deepEqual(calls, [['RESET_VIEW', 10], ['FOCUS_GEO', 10], 'cancel']);
  assert.equal(
    new CommandExecutor(rig, defaults).execute(command('RESET_VIEW'), 10),
    false,
  );
});
