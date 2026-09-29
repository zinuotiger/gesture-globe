import { test, expect } from 'vitest';
import { LocationSelection, CityIndex } from '../../src/geo/index.ts';
const selection = (id, latitude = 0) => ({
  schemaVersion: 1,
  selectionId: id,
  selectedAtMs: 1,
  latitude,
  longitude: 0,
});
const index = new CityIndex(
  [
    {
      schemaVersion: 1,
      id: 'origin',
      name: 'Origin',
      countryOrRegion: 'Fixture',
      latitude: 0,
      longitude: 0,
    },
  ],
  150,
);
function pending() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
test('coordinate appears immediately; old success and failure cannot replace new selection', async () => {
  const requests = [],
    signals = [],
    states = [];
  const location = new LocationSelection(
    (signal) => {
      const p = pending();
      requests.push(p);
      signals.push(signal);
      return p.promise;
    },
    (s) => states.push(s),
  );
  const a = location.select(selection('a'));
  expect(states.at(-1)).toMatchObject({
    cityStatus: 'LOADING',
    selection: { selectionId: 'a' },
  });
  const b = location.select(selection('b', 50));
  expect(signals[0].aborted).toBe(true);
  requests[1].resolve(index);
  await b;
  requests[0].resolve(index);
  await a;
  expect(location.getState()).toMatchObject({
    cityStatus: 'UNMATCHED',
    selection: { selectionId: 'b', latitude: 50 },
  });
  const c = location.select(selection('c'));
  const d = location.select(selection('d'));
  requests[3].resolve(index);
  await d;
  requests[2].reject(new Error('late'));
  await c;
  expect(location.getState()).toMatchObject({
    cityStatus: 'MATCHED',
    selection: { selectionId: 'd', nearestCity: { name: 'Origin' } },
  });
});
test('clear, reused ID and disposal reject late results even when transport ignores abort', async () => {
  const requests = [];
  const location = new LocationSelection(
    () => {
      const p = pending();
      requests.push(p);
      return p.promise;
    },
    () => {},
  );
  const a = location.select(selection('same'));
  location.clear();
  const b = location.select(selection('same', 50));
  requests[0].resolve(index);
  await a;
  expect(location.getState().selection.latitude).toBe(50);
  location.dispose();
  requests[1].resolve(index);
  await b;
  expect(location.getState()).toEqual({ selection: null, cityStatus: 'EMPTY' });
  await location.select(selection('late'));
  expect(requests).toHaveLength(2);
});
test('failed city data retains coordinates, retry recovers; invalid geography rejected', async () => {
  let failing = true;
  const location = new LocationSelection(
    async () => {
      if (failing) throw new Error('fetch failure');
      return index;
    },
    () => {},
  );
  await location.select(selection('one'));
  expect(location.getState()).toMatchObject({
    cityStatus: 'ERROR',
    selection: { latitude: 0 },
  });
  failing = false;
  await location.select(location.getState().selection);
  expect(location.getState().cityStatus).toBe('MATCHED');
  expect(Object.isFrozen(location.getState().selection)).toBe(true);
  await expect(location.select(selection('bad', 91))).rejects.toThrow(
    'Invalid',
  );
});
