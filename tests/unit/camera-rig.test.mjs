import assert from 'node:assert/strict';
import { test } from 'vitest';
import { CameraRig } from '../../src/globe/index.ts';
import { parseConfig } from '../../src/config/index.ts';
const defaults = parseConfig({
  globe: { initialAzimuth: 0, initialPolar: Math.PI / 2 },
});

test('setView clamps both polar/distance ends, wraps angles and prevents target mutation', () => {
  const rig = new CameraRig(defaults);
  rig.setView({ azimuth: 15 * Math.PI, polar: -100, distance: -100 });
  assert.equal(rig.getView().polar, defaults.globe.minPolar);
  assert.equal(rig.getView().distance, defaults.globe.minDistance);
  assert.ok(Math.abs(rig.getView().azimuth) <= Math.PI);
  rig.setView({ azimuth: -100, polar: 100, distance: 100 });
  assert.equal(rig.getView().polar, defaults.globe.maxPolar);
  assert.equal(rig.getView().distance, defaults.globe.maxDistance);
  assert.throws(() => {
    rig.getView().target.x = 1;
  });
  assert.throws(() => {
    rig.getView().distance = 0;
  });
});
test('invalid values and nonpositive dt leave the exact state unchanged', () => {
  const rig = new CameraRig(defaults);
  const original = rig.getView();
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.equal(rig.setView({ ...original, azimuth: bad }), false);
    assert.equal(rig.setView({ ...original, polar: bad }), false);
    assert.equal(rig.setView({ ...original, distance: bad }), false);
    assert.equal(rig.rotate(bad, 0, 0.016), false);
    assert.equal(rig.rotate(0, bad, 0.016), false);
    assert.equal(rig.rotate(0, 0, bad), false);
    assert.equal(rig.zoom(bad, 0.016), false);
    assert.equal(rig.zoom(0, bad), false);
  }
  for (const dt of [0, -1]) {
    assert.equal(rig.rotate(1, 1, dt), false);
    assert.equal(rig.zoom(1, dt), false);
  }
  assert.equal(rig.getView(), original);
});
test('refresh-rate independent deltas, bounded frame gaps and zero motion', () => {
  const result = [];
  for (const hz of [30, 60, 144]) {
    const rig = new CameraRig(defaults);
    for (let i = 0; i < hz; i++) {
      rig.rotate(0.2 / hz, 0.1 / hz, 1 / hz);
      rig.zoom(0.3 / hz, 1 / hz);
    }
    result.push(rig.getView());
  }
  for (const view of result) {
    assert.ok(Math.abs(view.azimuth - 0.2) < 1e-10);
    assert.ok(Math.abs(view.distance - 3.3) < 1e-10);
  }
  const rig = new CameraRig(defaults);
  rig.rotate(100, -100, 99);
  rig.zoom(100, 99);
  assert.ok(Math.abs(rig.getView().azimuth - 0.3) < 1e-10);
  assert.ok(Math.abs(rig.getView().distance - 3.12) < 1e-10);
  const before = rig.getView();
  rig.rotate(0, 0, 0.02);
  rig.zoom(0, 0.02);
  assert.deepEqual(rig.getView(), before);
});
test('spherical position stays on the bounded orbit, looking at a fixed origin', () => {
  const rig = new CameraRig(defaults);
  for (const azimuth of [-3, 0, 1, 3]) {
    rig.setView({ azimuth, polar: 1, distance: 2 });
    const p = rig.getPosition();
    assert.ok(Math.abs(Math.hypot(p.x, p.y, p.z) - 2) < 1e-12);
    assert.deepEqual(rig.getView().target, { x: 0, y: 0, z: 0 });
  }
});
