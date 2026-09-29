import { test, expect } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import { GeoConverter } from '../../src/geo/index.ts';
import { normalizeLongitude, directionToGeo } from '../../src/shared/index.ts';

// Fixed approximate city centers for section18.10 numeric regression, not a city dataset.
const cities = [
  ['Beijing', 39.9042, 116.4074],
  ['Shenzhen', 22.5431, 114.0579],
  ['Singapore', 1.3521, 103.8198],
  ['London', 51.5074, -0.1278],
  ['New York', 40.7128, -74.006],
  ['Sydney', -33.8688, 151.2093],
  ['Tokyo', 35.6762, 139.6503],
  ['Cape Town', -33.9249, 18.4241],
  ['Honolulu', 21.3099, -157.8581],
  ['Suva', -18.1248, 178.4501],
];
test('ten fixed city centers round-trip across radius and the unique offset', () => {
  for (const offset of [-180, -37, 0, 90, 180]) {
    const config = globalThis.structuredClone(defaults);
    config.geo.longitudeOffsetDeg = offset;
    config.globe.earthRadius = 2;
    const converter = new GeoConverter(config);
    for (const [name, lat, lon] of cities) {
      const point = converter.geoToWorld(lat, lon);
      const result = converter.worldToGeo(point);
      expect(Math.hypot(point.x, point.y, point.z), name).toBeCloseTo(2, 12);
      expect(result.latitude, name).toBeCloseTo(lat, 9);
      expect(result.longitude, name).toBeCloseTo(lon, 9);
    }
  }
});
test('independent cardinal axes establish north/east orientation and dateline normalization', () => {
  const converter = new GeoConverter(defaults);
  for (const [point, lat, lon] of [
    [{ x: 1, y: 0, z: 0 }, 0, 0],
    [{ x: 0, y: 0, z: -1 }, 0, 90],
    [{ x: 0, y: 0, z: 1 }, 0, -90],
    [{ x: -1, y: 0, z: 0 }, 0, -180],
    [{ x: 0, y: 1, z: 0 }, 90, 0],
    [{ x: 0, y: -1, z: 0 }, -90, 0],
  ]) {
    const result = converter.worldToGeo(point);
    expect(result.latitude).toBeCloseTo(lat, 12);
    expect(result.longitude).toBeCloseTo(lon, 12);
  }
  for (const lon of [-540, -180, 180, 540])
    expect(normalizeLongitude(lon)).toBe(-180);
  for (const lon of [-179.999, 179.999])
    expect(
      converter.worldToGeo(converter.geoToWorld(0, lon)).longitude,
    ).toBeCloseTo(lon, 9);
  expect(converter.geoToWorld(0, 90).z).toBe(-1);
});
test('world normalization handles extreme scales while zero and nonfinite inputs are rejected', () => {
  const c = new GeoConverter(defaults);
  for (const scale of [1e-300, 1, 1e308]) {
    const result = c.worldToGeo({ x: scale, y: scale, z: -scale });
    expect(result.latitude).toBeCloseTo(35.264389682754654, 9);
    expect(result.longitude).toBe(45);
  }
  expect(c.worldToGeo({ x: 0, y: 0, z: 0 })).toBeUndefined();
  for (const x of [NaN, Infinity, -Infinity])
    expect(c.worldToGeo({ x, y: 1, z: 1 })).toBeUndefined();
  for (const lat of [-91, 91, NaN, Infinity])
    expect(c.geoToWorld(lat, 0)).toBeUndefined();
  expect(c.geoToWorld(0, NaN)).toBeUndefined();
  expect(directionToGeo({ x: 1, y: 0, z: 0 }, NaN)).toBeUndefined();
  expect(() => normalizeLongitude(Infinity)).toThrow(RangeError);
});
