import assert from 'node:assert/strict';
import { test } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { CameraRig, TransitionController } from '../../src/globe/index.ts';
import { parseConfig } from '../../src/config/index.ts';
const defaults = parseConfig({
  globe: { initialAzimuth: 0, initialPolar: Math.PI / 2 },
});
const reset = { schemaVersion: 1, id: 'reset', at: 0, type: 'RESET_VIEW' };
const focus = (lat, lon) => ({ ...reset, type: 'FOCUS_GEO', lat, lon });

test('reset smooth midpoint/end, duration bounds, repeated reset does not restart', () => {
  const rig = new CameraRig(defaults);
  const transition = new TransitionController(rig, defaults);
  rig.setView({ azimuth: 1, polar: 1, distance: 2 });
  assert.equal(transition.start(reset, 0), true);
  transition.update(400);
  assert.ok(Math.abs(rig.getView().azimuth - 0.5) < 1e-10);
  assert.equal(transition.start({ ...reset, id: 'held' }, 400), false);
  transition.update(800);
  assert.equal(transition.kind, 'IDLE');
  assert.ok(
    Math.abs(rig.getView().distance - defaults.globe.initialDistance) < 1e-10,
  );
  transition.start({ ...reset, durationMs: 0 }, 1000);
  transition.update(1599);
  assert.equal(transition.kind, 'RESET');
  transition.update(1600);
  assert.equal(transition.kind, 'IDLE');
  transition.start({ ...reset, durationMs: 10000 }, 2000);
  transition.update(3000);
  assert.equal(transition.kind, 'IDLE');
});
test('shortest seam route and cancellation preserve the current view; invalid time cannot rewind', () => {
  const rig = new CameraRig(defaults);
  const transition = new TransitionController(rig, defaults);
  rig.setView({
    azimuth: (179 * Math.PI) / 180,
    polar: Math.PI / 2,
    distance: 3,
  });
  transition.start(focus(0, 91), 0);
  transition.update(400);
  assert.ok(Math.abs(Math.abs(rig.getView().azimuth) - Math.PI) < 1e-10);
  const midpoint = rig.getView();
  transition.update(200);
  transition.update(NaN);
  assert.equal(rig.getView(), midpoint);
  transition.cancel();
  transition.update(1000);
  assert.equal(rig.getView(), midpoint);
  assert.equal(transition.kind, 'IDLE');
});
test('named city coordinates project to center using the canonical geographic convention', () => {
  for (const [name, lat, lon] of [
    ['Beijing', 39.9, 116.4],
    ['Shenzhen', 22.5, 114.1],
    ['Singapore', 1.35, 103.82],
    ['London', 51.5, -0.12],
    ['New York', 40.7, -74],
    ['Sydney', -33.9, 151.2],
    ['Tokyo', 35.7, 139.7],
    ['Cape Town', -33.9, 18.4],
    ['Honolulu', 21.3, -157.8],
    ['Date line', 0, 179.9],
  ]) {
    const rig = new CameraRig(defaults);
    const transition = new TransitionController(rig, defaults);
    assert.equal(transition.start(focus(lat, lon), 0), true, name);
    transition.update(800);
    const p = rig.getPosition();
    assert.ok(
      Math.abs((Math.atan2(-p.z, p.x) * 180) / Math.PI - lon) < 1e-9,
      name,
    );
    const latitude = (lat * Math.PI) / 180;
    const longitude = (lon * Math.PI) / 180;
    const point = new Vector3(
      Math.cos(latitude) * Math.cos(longitude),
      Math.sin(latitude),
      -Math.cos(latitude) * Math.sin(longitude),
    );
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    point.project(camera);
    assert.ok(Math.abs(point.x) < 1e-10 && Math.abs(point.y) < 1e-10, name);
  }
});
test('offset is applied once and malformed focus leaves current transition unchanged', () => {
  const config = parseConfig({ geo: { longitudeOffsetDeg: 20 } });
  const rig = new CameraRig(config);
  const transition = new TransitionController(rig, config);
  transition.start(focus(0, 20), 0);
  transition.update(800);
  const p = rig.getPosition();
  assert.ok(Math.abs(p.z) < 1e-10);
  assert.ok(p.x > 0);
  assert.equal(transition.start(focus(100, 0), 0), false);
  assert.equal(transition.start(focus(0, NaN), 0), false);
});
