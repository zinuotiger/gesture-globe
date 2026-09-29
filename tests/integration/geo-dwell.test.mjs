import { test, expect } from 'vitest';
import {
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  PerspectiveCamera,
} from 'three';
import {
  toNdc,
  EarthRaycaster,
  DwellSelector,
  GeoConverter,
} from '../../src/geo/index.ts';
import { defaults } from '../../src/config/index.ts';

test('screen → real earth ray → dwell → geographic point selects once; sky cancels', () => {
  const geometry = new SphereGeometry(1, 64, 32),
    material = new MeshBasicMaterial();
  try {
    const earth = new Mesh(geometry, material),
      camera = new PerspectiveCamera(45, 2, 0.1, 100);
    camera.position.z = 3;
    camera.lookAt(0, 0, 0);
    const ray = new EarthRaycaster(camera, [earth]),
      dwell = new DwellSelector(defaults),
      geo = new GeoConverter(defaults);
    const rect = { left: 100, top: 80, width: 800, height: 400 },
      pointer = { x: 0.5, y: 0.5 };
    const hit = ray.hit(toNdc({ x: 500, y: 280 }, rect));
    const selected = [];
    for (let t = 0; t <= 1000; t += 50) {
      const value = dwell.update(pointer, hit?.point, t);
      if (value.selection) selected.push(value.selection);
    }
    expect(selected).toHaveLength(1);
    const place = geo.worldToGeo(selected[0].point);
    expect(place.latitude).toBeCloseTo(0, 8);
    expect(place.longitude).toBeCloseTo(-90, 8);
    const sky = ray.hit(toNdc({ x: 900, y: 80 }, rect));
    expect(sky).toBeUndefined();
    expect(dwell.update({ x: 1, y: 0 }, sky?.point, 1050).state.progress).toBe(
      0,
    );
  } finally {
    geometry.dispose();
    material.dispose();
  }
});
