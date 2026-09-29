import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { defaults, cityAsset } from '../../src/config/index.ts';
import {
  CityIndex,
  parseCityRecords,
  haversineKm,
  loadCityIndex,
} from '../../src/geo/index.ts';
const bytes = await readFile('public/data/cities-natural-earth-5.1.2.json');
const raw = JSON.parse(bytes.toString('utf8'));
const city = (id, latitude, longitude) => ({
  schemaVersion: 1,
  id,
  name: id,
  countryOrRegion: 'Test fixture',
  latitude,
  longitude,
});
test('actual licensed dataset has243 unique finite cities, fixed provenance, Chinese labels and English aliases', () => {
  const records = parseCityRecords(raw);
  expect(records).toHaveLength(243);
  expect(new Set(records.map((c) => c.id)).size).toBe(243);
  const beijing = records.find((c) => c.aliases?.includes('Beijing'));
  expect(beijing.name).toContain('北京');
  expect(
    new CityIndex(records, 150).nearest(beijing.latitude, beijing.longitude).id,
  ).toBe(beijing.id);
  expect(Object.isFrozen(records)).toBe(true);
  expect(Object.isFrozen(records[0])).toBe(true);
  expect(cityAsset().url).toBe('/data/cities-natural-earth-5.1.2.json');
});
test('schema rejects missing data, duplicate IDs, schema version, invalid coordinate and aliases', () => {
  expect(() => parseCityRecords([])).toThrow();
  for (const patch of [
    { schemaVersion: 2 },
    { id: '' },
    { name: '' },
    { countryOrRegion: '' },
    { latitude: 91 },
    { latitude: NaN },
    { longitude: 180 },
    { longitude: -181 },
    { aliases: [0] },
  ])
    expect(() =>
      parseCityRecords([{ ...city('a', 0, 0), ...patch }], 1),
    ).toThrow();
  expect(() =>
    parseCityRecords([city('a', 0, 0), city('a', 1, 1)], 1),
  ).toThrow();
  expect(() => new CityIndex([city('a', 0, 0)], -1)).toThrow();
});
test('Haversine handles equator, poles, antipodes and date line with symmetry', () => {
  expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19508, 4);
  expect(haversineKm(0, 179.5, 0, -179.5)).toBeCloseTo(111.19508, 4);
  expect(haversineKm(90, 0, 90, 180)).toBeLessThan(1e-10);
  expect(haversineKm(0, 0, 0, 180)).toBeCloseTo(20015.11444, 4);
  expect(haversineKm(-35, 150, 52, -1)).toBe(haversineKm(52, -1, -35, 150));
  expect(() => haversineKm(91, 0, 0, 0)).toThrow();
  expect(() => haversineKm(0, Infinity, 0, 0)).toThrow();
});
test('nearest match threshold never guesses and ties use stable IDs rather than file order', () => {
  const index = new CityIndex(
    [city('b', 0, 0), city('a', 0, 0), city('c', 0, 179.9)],
    150,
  );
  expect(index.nearest(0, 0).id).toBe('a');
  expect(index.nearest(0, 2)).toBeUndefined();
  expect(index.nearest(0, -179.9).id).toBe('c');
  expect(new CityIndex([city('a', 0, 0)], 0).nearest(0, 0).distanceKm).toBe(0);
  expect(() => index.nearest(NaN, 0)).toThrow();
});
test('actual data bytes load only after exact integrity, with explicit HTTP/size/hash/cancel failures', async () => {
  const request = async (url) => {
    expect(url).toBe(cityAsset().url);
    return new globalThis.Response(bytes);
  };
  expect((await loadCityIndex(defaults, undefined, request)).size).toBe(243);
  await expect(
    loadCityIndex(
      defaults,
      undefined,
      async () => new globalThis.Response('', { status: 404 }),
    ),
  ).rejects.toThrow('E-GEO-001');
  await expect(
    loadCityIndex(
      defaults,
      undefined,
      async () => new globalThis.Response(bytes.subarray(1)),
    ),
  ).rejects.toThrow('integrity');
  const wrong = new Uint8Array(bytes);
  wrong[0] ^= 1;
  await expect(
    loadCityIndex(
      defaults,
      undefined,
      async () => new globalThis.Response(wrong),
    ),
  ).rejects.toThrow('integrity');
  await expect(
    loadCityIndex(
      defaults,
      undefined,
      async () => new globalThis.Response(new Uint8Array(bytes.length + 1)),
    ),
  ).rejects.toThrow('size');
  const abort = new globalThis.AbortController();
  abort.abort();
  await expect(
    loadCityIndex(defaults, abort.signal, request),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
