import { test, expect } from 'vitest';
import {
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  PerspectiveCamera,
  Group,
} from 'three';
import { mapScreenPoint, toNdc, EarthRaycaster } from '../../src/geo/index.ts';

test('client offsets, CSS scaling, all corners and DPR map without double mirroring', () => {
  const rect = { left: 150, top: 80, width: 400, height: 200 };
  for (const [x, y, nx, ny] of [
    [150, 80, -1, 1],
    [550, 80, 1, 1],
    [150, 280, -1, -1],
    [550, 280, 1, -1],
    [350, 180, 0, 0],
  ])
    expect(toNdc({ x, y }, rect)).toEqual({ x: nx, y: ny });
  const mapped = mapScreenPoint({ x: 250, y: 130 }, rect, 2);
  expect(mapped.local).toEqual({ x: 100, y: 50 });
  expect(mapped.buffer).toEqual({ x: 200, y: 100 });
  expect(mapped.ndc).toEqual({ x: -0.5, y: 0.5 });
  expect(mapScreenPoint({ x: 250, y: 130 }, rect, 1).ndc).toEqual(mapped.ndc);
});
test('outside canvas, invalid dimensions and nonfinite input fail closed', () => {
  expect(
    toNdc(
      { x: 1e308, y: 1e308 },
      { left: 0, top: 0, width: 1e308, height: 1e308 },
    ),
  ).toEqual({ x: 1, y: -1 });
  const rect = { left: 10, top: 20, width: 100, height: 50 };
  for (const point of [
    { x: 9, y: 20 },
    { x: 111, y: 20 },
    { x: 10, y: 19 },
    { x: 10, y: 71 },
    { x: NaN, y: 20 },
    { x: 10, y: Infinity },
  ])
    expect(toNdc(point, rect)).toBeUndefined();
  for (const width of [0, -1, NaN, Infinity])
    expect(toNdc({ x: 10, y: 20 }, { ...rect, width })).toBeUndefined();
  for (const ratio of [0, -1, NaN, Infinity])
    expect(mapScreenPoint({ x: 10, y: 20 }, rect, ratio)).toBeUndefined();
});
test('actual Three ray hits only nearest forward earth mesh, never marker children or background', () => {
  const geometry = new SphereGeometry(1, 64, 32),
    material = new MeshBasicMaterial();
  try {
    const earth = new Mesh(geometry, material),
      marker = new Mesh(geometry, material);
    marker.scale.setScalar(0.3);
    marker.position.z = 1.5;
    earth.add(marker);
    const farther = new Mesh(geometry, material);
    farther.position.z = -4;
    const camera = new PerspectiveCamera(45, 2, 0.1, 100);
    camera.position.z = 3;
    camera.lookAt(0, 0, 0);
    const picker = new EarthRaycaster(camera, [farther, earth]);
    const hit = picker.hit({ x: 0, y: 0 });
    expect(hit.point.z).toBeCloseTo(1, 6);
    expect(hit.distance).toBeCloseTo(2, 6);
    expect(hit.normal.z).toBeGreaterThan(0.99);
    expect(picker.hit({ x: 1, y: 1 })).toBeUndefined();
    expect(picker.hit({ x: 2, y: 0 })).toBeUndefined();
    expect(picker.hit({ x: NaN, y: 0 })).toBeUndefined();
    camera.lookAt(0, 0, 10);
    expect(picker.hit({ x: 0, y: 0 })).toBeUndefined();
    camera.lookAt(0, 0, 0);
    earth.visible = false;
    farther.visible = false;
    expect(picker.hit({ x: 0, y: 0 })).toBeUndefined();
    earth.visible = true;
    const group = new Group();
    group.add(earth);
    group.visible = false;
    expect(picker.hit({ x: 0, y: 0 })).toBeUndefined();
  } finally {
    geometry.dispose();
    material.dispose();
  }
});
