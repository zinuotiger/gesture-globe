import { test, expect } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import { defaults } from '../../src/config/index.ts';
import { MarkerManager } from '../../src/geo/index.ts';
const selection = (id, lat, lon) => ({
  schemaVersion: 1,
  selectionId: id,
  selectedAtMs: 1,
  latitude: lat,
  longitude: lon,
});

test('front marker is visible, back and horizon are hidden, depth testing cannot be disabled by selection', () => {
  const scene = new Scene(),
    camera = new PerspectiveCamera(45, 1, 0.1, 100),
    markers = new MarkerManager(scene, defaults);
  camera.position.z = 3;
  camera.lookAt(0, 0, 0);
  const mesh = scene.getObjectByName('current-location-marker');
  expect(mesh.material.depthTest).toBe(true);
  expect(mesh.material.depthWrite).toBe(true);
  markers.setSelection(selection('front', 0, -90));
  expect(markers.update(camera).visible).toBe(true);
  markers.setSelection(selection('back', 0, 90));
  expect(markers.update(camera).visible).toBe(false);
  markers.setSelection(selection('horizon', 0, 0));
  expect(markers.update(camera).visible).toBe(false);
  camera.position.set(3, 0, 0);
  expect(markers.update(camera).visible).toBe(true);
  camera.position.set(NaN, 0, 0);
  expect(markers.update(camera).visible).toBe(false);
  markers.dispose();
});
test('selection replaces one owned mesh and disposal frees geometry/material once', () => {
  const scene = new Scene(),
    markers = new MarkerManager(scene, defaults);
  const mesh = scene.children[0];
  let geometries = 0,
    materials = 0;
  mesh.geometry.addEventListener('dispose', () => geometries++);
  mesh.material.addEventListener('dispose', () => materials++);
  for (let i = 0; i < 100; i++)
    markers.setSelection(selection(`s-${i}`, 10, i));
  expect(scene.children).toEqual([mesh]);
  expect(markers.getState().selectionId).toBe('s-99');
  expect(() => markers.setSelection(selection('s-99', 11, 99))).toThrow(
    'selectionId',
  );
  markers.clear();
  expect(markers.getState()).toMatchObject({
    visible: false,
    selectionId: null,
  });
  markers.dispose();
  markers.dispose();
  markers.setSelection(selection('late', 0, 0));
  expect(scene.children).toHaveLength(0);
  expect(geometries).toBe(1);
  expect(materials).toBe(1);
  expect(markers.getState().selectionId).toBeNull();
});
test('marker honors the canonical texture offset and rejects invalid selection coordinates', () => {
  const config = globalThis.structuredClone(defaults);
  config.geo.longitudeOffsetDeg = 90;
  const markers = new MarkerManager(new Scene(), config);
  markers.setSelection(selection('offset', 0, 90));
  expect(markers.getState().position.x).toBeCloseTo(1, 10);
  for (const bad of [
    selection('bad', 91, 0),
    selection('bad', 0, 180),
    selection('bad', NaN, 0),
    selection('', 0, 0),
  ])
    expect(() => markers.setSelection(bad)).toThrow();
  markers.dispose();
});
