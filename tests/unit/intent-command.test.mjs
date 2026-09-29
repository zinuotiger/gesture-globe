import assert from 'node:assert/strict';
import { test } from 'vitest';
import { mapIntent } from '../../src/interaction/index.ts';
import { defaults } from '../../src/config/index.ts';
const input = (kind, payload = {}, patch = {}) => ({
  schemaVersion: 1,
  id: 'i',
  source: 'ui',
  kind,
  phase: ['RESET', 'CANCEL', 'FOCUS', 'SET_AUTOROTATE'].includes(kind)
    ? 'TRIGGER'
    : 'UPDATE',
  timestampMs: 100,
  payload,
  ...patch,
});
const map = (v, nowMs = 100, view = { distance: 3 }) =>
  mapIntent(v, { nowMs, view });
test('mapping rejects missing/NaN/Infinity/future/stale payloads and keeps source clocks explicit', () => {
  for (const payload of [
    {},
    { yaw: 1, pitch: 0 },
    { yaw: NaN, pitch: 0, dt: 0.04 },
    { yaw: 1, pitch: Infinity, dt: 0.04 },
    { yaw: 1, pitch: 0, dt: 0 },
    { yaw: 1, pitch: 0, dt: -1 },
  ])
    assert.equal(map(input('ROTATE', payload)).ok, false);
  assert.equal(map(input('RESET'), 99).reason, 'INVALID_TIME');
  assert.equal(map(input('RESET'), Infinity).reason, 'INVALID_TIME');
  assert.equal(map(input('RESET'), 400).ok, true);
  assert.equal(map(input('RESET'), 401).reason, 'STALE');
  const g = input(
    'RESET',
    { sessionId: 's', sourceHandId: 'h', confidence: 0.9 },
    { source: 'gesture' },
  );
  assert.equal(map(g, 250).ok, true);
  assert.equal(map(g, 251).reason, 'STALE');
  assert.equal(
    map(input('RESET', {}, { source: 'agent' })).reason,
    'FEATURE_DISABLED',
  );
});
test('movement is velocity-bounded and large gaps cannot accumulate hidden displacement', () => {
  const c = map(input('ROTATE', { yaw: 100, pitch: -100, dt: 1 })).action
    .command;
  assert.equal(c.dt, 0.1);
  assert.ok(Math.abs(c.yaw - 0.3) < 1e-12);
  assert.ok(Math.abs(c.pitch + 0.3) < 1e-12);
  const gap = map(input('ROTATE', { yaw: 0.2, pitch: 0, dt: 1 })).action
    .command;
  assert.ok(Math.abs(gap.yaw - 0.02) < 1e-12);
  const huge = map(
    input('ZOOM', { delta: Number.MAX_VALUE, dt: Number.MIN_VALUE }),
  );
  assert.equal(huge.ok, true);
  assert.ok(Number.isFinite(huge.action.command.delta));
  assert.equal(
    map(input('ROTATE', { yaw: 1, pitch: 0, dt: 0 }, { phase: 'START' })).ok,
    false,
  );
  assert.equal(
    map(input('ROTATE', { yaw: 0, pitch: 0, dt: 0 }, { phase: 'START' })).action
      .type,
    'CONTROL_START',
  );
  assert.equal(
    map(input('ZOOM', {}, { phase: 'CANCEL' })).action.type,
    'CONTROL_CANCEL',
  );
});
test('gesture log zoom converts through actual bounded distance; other sources retain linear command units', () => {
  const g = input(
    'ZOOM',
    {
      delta: 0.01,
      dt: 0.04,
      sessionId: 's',
      sourceHandId: 'h',
      confidence: 0.9,
    },
    { source: 'gesture' },
  );
  const c = map(g).action.command;
  assert.ok(Math.abs(c.delta - 3 * Math.expm1(0.01)) < 1e-12);
  assert.equal(mapIntent(g, { nowMs: 100 }).reason, 'INVALID_VIEW');
  for (const distance of [NaN, 0, 5])
    assert.equal(map(g, 100, { distance }).reason, 'INVALID_VIEW');
  assert.equal(
    map(input('ZOOM', { delta: 0.01, dt: 0.04 })).action.command.delta,
    0.01,
  );
});
test('discrete mappings preserve identity/trace and enforce geography/boolean completeness', () => {
  const reset = map(input('RESET', {}, { traceId: 'trace' })).action.command;
  assert.equal(reset.type, 'RESET_VIEW');
  assert.equal(reset.id, 'ui:i');
  assert.equal(reset.traceId, 'trace');
  assert.equal(map(input('CANCEL')).action.command.type, 'CANCEL_TRANSITION');
  assert.equal(
    map(input('SET_AUTOROTATE', { enabled: false })).action.command.enabled,
    false,
  );
  assert.equal(map(input('SET_AUTOROTATE')).ok, false);
  for (const payload of [
    {},
    { lat: 91, lon: 0 },
    { lat: 0, lon: 181 },
    { lat: 0, lon: 0, distance: 100 },
  ])
    assert.equal(map(input('FOCUS', payload)).ok, false);
  assert.equal(
    map(
      input('FOCUS', {
        lat: -90,
        lon: 180,
        distance: defaults.globe.minDistance,
      }),
    ).action.command.type,
    'FOCUS_GEO',
  );
});
test('pointer and pause route as non-Globe actions; no fake hit, selection or command is emitted', () => {
  const pointer = map(input('SELECT', { pointer: { x: 0.2, y: 0.3 } })).action;
  assert.equal(pointer.type, 'SELECT_POINTER');
  assert.equal('selectionId' in pointer, false);
  assert.equal('command' in pointer, false);
  assert.equal(
    map(input('SELECT', {}, { phase: 'END' })).action.type,
    'SELECT_CANCEL',
  );
  assert.equal(map(input('SELECT')).ok, false);
  assert.equal(map(input('PAUSE', {}, { phase: 'START' })).ok, false);
  const pause = input(
    'PAUSE',
    { sessionId: 's', sourceHandId: 'h', confidence: 0.9 },
    { source: 'gesture', phase: 'START' },
  );
  assert.deepEqual(map(pause).action, { type: 'PAUSE_GESTURE', paused: true });
  assert.deepEqual(map({ ...pause, phase: 'END' }).action, {
    type: 'PAUSE_GESTURE',
    paused: false,
  });
});
