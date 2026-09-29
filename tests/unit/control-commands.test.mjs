import assert from 'node:assert/strict';
import { test } from 'vitest';
import { controlCommand } from '../../src/app/controlCommands.ts';
import { defaults } from '../../src/config/index.ts';
import {
  CameraRig,
  CommandExecutor,
  TransitionController,
} from '../../src/globe/index.ts';
test('semantic controls reach validated commands and can reset/cancel without camera', () => {
  const rig = new CameraRig(defaults);
  const executor = new CommandExecutor(
    rig,
    defaults,
    new TransitionController(rig, defaults),
  );
  const original = rig.getView();
  let id = 0;
  const apply = (action) =>
    executor.execute(controlCommand(action, `${++id}`, 0, defaults), 0);
  assert.equal(apply('left'), true);
  assert.ok(rig.getView().azimuth < original.azimuth);
  assert.equal(apply('right'), true);
  assert.equal(apply('up'), true);
  assert.ok(rig.getView().polar < original.polar);
  assert.equal(apply('down'), true);
  assert.equal(apply('in'), true);
  assert.ok(rig.getView().distance < original.distance);
  assert.equal(apply('out'), true);
  assert.equal(apply('reset'), true);
  assert.equal(executor.getViewState().transition, 'RESET');
  assert.equal(apply('cancel'), true);
  assert.equal(executor.getViewState().transition, 'IDLE');
  assert.equal(controlCommand('invalid', 'id', 0, defaults), undefined);
  executor.dispose();
});
