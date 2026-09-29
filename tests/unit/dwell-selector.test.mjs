import { test, expect } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import { DwellSelector } from '../../src/geo/index.ts';
const p = { x: 0.5, y: 0.5 },
  hit = { x: 0, y: 0, z: 1 };
test('exact accumulated dwell freezes one hit/selection ID and holding cannot retrigger after cooldown', () => {
  const d = new DwellSelector(defaults, 'test'),
    events = [];
  for (let t = 0; t <= 3000; t += 50) {
    const r = d.update(p, hit, t);
    if (r.selection) events.push(r.selection);
  }
  expect(events).toHaveLength(1);
  expect(events[0]).toEqual({
    selectionId: 'test-1',
    selectedAtMs: 650,
    point: hit,
  });
  expect(Object.isFrozen(events[0].point)).toBe(true);
  expect(d.getState()).toMatchObject({ phase: 'SELECTED', progress: 1 });
  d.cancel();
  for (let t = 3050; t <= 3700; t += 50) {
    const r = d.update(p, hit, t);
    if (r.selection) events.push(r.selection);
  }
  expect(events[1].selectionId).toBe('test-2');
});
test('short drift pauses elapsed time; prolonged drift or opposite surface resets', () => {
  const d = new DwellSelector(defaults);
  for (let t = 0; t <= 300; t += 50) d.update(p, hit, t);
  const progress = d.getState().progress;
  expect(d.update({ x: 0.53, y: 0.5 }, hit, 350).state.phase).toBe('DRIFTING');
  expect(d.update(p, hit, 400).state.progress).toBe(progress);
  expect(d.update(p, hit, 450).state.progress).toBeCloseTo(350 / 650);
  d.update({ x: 0.53, y: 0.5 }, hit, 500);
  d.update({ x: 0.53, y: 0.5 }, hit, 600);
  expect(d.update({ x: 0.53, y: 0.5 }, hit, 650).state.progress).toBe(0);
  d.update({ x: 0.53, y: 0.5 }, hit, 700);
  expect(
    d.update({ x: 0.53, y: 0.5 }, { x: 0, y: 0, z: -1 }, 750).state.progress,
  ).toBe(0);
});
test('background, cancel, stale frame gaps and invalid time cannot complete a dwell', () => {
  const d = new DwellSelector(defaults);
  d.update(p, hit, 0);
  d.update(p, hit, 100);
  expect(d.update(p, undefined, 150).state).toMatchObject({
    phase: 'IDLE',
    progress: 0,
  });
  d.update(p, hit, 200);
  expect(d.update(p, hit, 1000).state.progress).toBe(0);
  expect(d.update(p, hit, 999).state.progress).toBe(0);
  for (const bad of [
    { x: NaN, y: 0 },
    { x: 2, y: 0.5 },
  ])
    expect(d.update(bad, hit, 1100).state.phase).toBe('IDLE');
  expect(d.update(p, { x: 0, y: 0, z: 0 }, 1200).state.phase).toBe('IDLE');
  d.update(p, hit, 1300);
  expect(d.cancel().center).toBeNull();
  d.update(p, hit, 1400);
  d.update(p, hit, 1450);
  expect(d.expire(1500).progress).toBeGreaterThan(0);
  expect(d.expire(1601).phase).toBe('IDLE');
});
test('cancel and changing target cannot bypass selection cooldown', () => {
  const d = new DwellSelector(defaults);
  let count = 0;
  for (let t = 0; t <= 650; t += 50)
    count += Number(!!d.update(p, hit, t).selection);
  d.cancel();
  for (let t = 700; t < 1450; t += 50) {
    const r = d.update({ x: 0.7, y: 0.5 }, hit, t);
    expect(r.selection).toBeUndefined();
    expect(r.state.phase).toBe('COOLDOWN');
  }
  for (let t = 1450; t <= 2100; t += 50)
    count += Number(!!d.update({ x: 0.7, y: 0.5 }, hit, t).selection);
  expect(count).toBe(2);
});
