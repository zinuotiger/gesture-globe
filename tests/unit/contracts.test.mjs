import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  assertSchemaVersion,
  assertEventEnvelope,
  isPlainDto,
} from '../../src/shared/index.ts';

test('schema rejects missing and unknown versions', () => {
  for (const v of [null, {}, { schemaVersion: 2 }, { schemaVersion: '1' }])
    assert.throws(() => assertSchemaVersion(v));
  assert.doesNotThrow(() => assertSchemaVersion({ schemaVersion: 1 }));
});
test('event envelope is plain structured-cloneable data', () => {
  const event = {
    schemaVersion: 1,
    eventId: 'e1',
    type: 'READY',
    atMs: 0,
    source: 'M01',
    payload: { ready: true },
  };
  assert.doesNotThrow(() => assertEventEnvelope(event));
  assert.deepEqual(globalThis.structuredClone(event), event);
  for (const bad of [
    { ...event, source: 'M99' },
    { ...event, atMs: NaN },
    { ...event, sessionId: 5 },
  ])
    assert.throws(() => assertEventEnvelope(bad));
});
test('rejects classes, functions, cycles, nonfinite numbers and accessor objects', () => {
  const cycle = {};
  cycle.self = cycle;
  for (const bad of [
    new Date(),
    () => 1,
    cycle,
    { x: Infinity },
    {
      get x() {
        throw new Error('getter must never run');
      },
    },
  ])
    assert.equal(isPlainDto(bad), false);
  assert.equal(isPlainDto({ points: [{ x: 0, y: 1, z: 0 }] }), true);
});

test('event metadata validates every required field and optional identifier', () => {
  const base = {
    schemaVersion: 1,
    eventId: 'e',
    type: 'READY',
    atMs: 0,
    source: 'M01',
    payload: null,
  };
  for (const field of ['eventId', 'type', 'atMs', 'source', 'payload']) {
    const value = { ...base };
    delete value[field];
    assert.throws(() => assertEventEnvelope(value));
  }
  for (const bad of [
    { eventId: '' },
    { type: '' },
    { atMs: -1 },
    { traceId: '' },
    { payload: { fn: () => 1 } },
  ])
    assert.throws(() => assertEventEnvelope({ ...base, ...bad }));
  assert.doesNotThrow(() =>
    assertEventEnvelope({ ...base, sessionId: 's', traceId: 't' }),
  );
  assert.equal(isPlainDto({ [Symbol('hidden')]: 1 }), false);
  assert.equal(
    isPlainDto(Object.assign(Object.create(null), { value: true })),
    true,
  );
});
