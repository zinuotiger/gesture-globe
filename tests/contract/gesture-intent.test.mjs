import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  assertGestureIntent,
  parseGestureIntent,
} from '../../src/shared/index.ts';
import { GestureEngine, mapTransition } from '../../src/gesture/index.ts';
import { gestureFrame, pinchFrame } from '../fixtures/gesture-frames.mjs';
const context = (kind, extra = {}) => ({
  id: 'i',
  sessionId: 's',
  sourceHandId: 'h',
  kind,
  confidence: 0.9,
  delta: { x: 0.1, y: 0.2 },
  pointer: { x: 0.3, y: 0.4 },
  ...extra,
});
const map = (kind, phase, extra) =>
  mapTransition({ phase, atMs: 10 }, context(kind, extra));
test('consumer drops unknown optional extensions but still rejects invalid known semantics and owns its payload', () => {
  const input = {
    ...map('SELECT', 'START'),
    futureOptional: { version: 2 },
    landmarks: [],
  };
  const parsed = parseGestureIntent(input);
  assert.equal('futureOptional' in parsed, false);
  assert.equal('landmarks' in parsed, false);
  input.pointer.x = 0.99;
  assert.equal(parsed.pointer.x, 0.3);
  assert.throws(() => parseGestureIntent({ ...input, schemaVersion: 2 }));
  assert.throws(() =>
    parseGestureIntent({ ...input, pointer: { x: NaN, y: 0 } }),
  );
});
test('intent phase/payload matrix is exact and survives structured cloning', () => {
  const valid = {
    NONE: ['END', 'CANCEL'],
    ROTATE: ['START', 'UPDATE', 'END', 'CANCEL'],
    ZOOM: ['START', 'UPDATE', 'END', 'CANCEL'],
    PAUSE: ['START', 'END', 'CANCEL'],
    SELECT: ['START', 'UPDATE', 'END', 'CANCEL'],
    RESET: ['TRIGGER'],
  };
  for (const [kind, phases] of Object.entries(valid)) {
    for (const phase of ['START', 'UPDATE', 'END', 'CANCEL', 'TRIGGER']) {
      if (!phases.includes(phase)) {
        assert.throws(() => map(kind, phase));
        continue;
      }
      const output = map(kind, phase);
      assertGestureIntent(globalThis.structuredClone(output));
      if (phase === 'START' && ['ROTATE', 'ZOOM'].includes(kind))
        assert.deepEqual(output.delta, { x: 0, y: 0 });
      if (['END', 'CANCEL', 'TRIGGER'].includes(phase)) {
        assert.equal(output.delta, undefined);
        assert.equal(output.pointer, undefined);
      }
    }
  }
});
test('schema rejects unsupported versions, metadata, nonfinite values, illegal phase and leaked raw fields', () => {
  const good = map('ROTATE', 'UPDATE');
  const patches = [
    { schemaVersion: 2 },
    { id: '' },
    { sessionId: ' ' },
    { sourceHandId: '' },
    { source: 'mouse' },
    { timestampMs: -1 },
    { timestampMs: Infinity },
    { confidence: NaN },
    { confidence: 1.01 },
    { confidence: -0.1 },
    { kind: 'UNSAFE' },
    { kind: '__proto__' },
    { phase: 'TRIGGER' },
    { delta: { x: NaN, y: 0 } },
    { delta: { x: 0 } },
    { delta: { x: 0, y: 0, z: 0 } },
    { pointer: { x: 0, y: 0 } },
    { traceId: '' },
    { landmarks: [] },
    { debug: { candidate: 'a', stableFrames: -1 } },
    { debug: { candidate: 'a', stableFrames: 1, raw: [] } },
  ];
  for (const patch of patches)
    assert.throws(
      () => assertGestureIntent({ ...good, ...patch }),
      JSON.stringify(patch),
    );
  const getter = { ...good };
  Object.defineProperty(getter, 'delta', {
    get: () => {
      throw new Error('getter must not run');
    },
    enumerable: true,
  });
  assert.throws(() => assertGestureIntent(getter), /plain finite DTO/);
  const cycle = { ...good };
  cycle.debug = cycle;
  assert.throws(() => assertGestureIntent(cycle));
  assert.throws(() =>
    assertGestureIntent({ ...map('ROTATE', 'START'), delta: { x: 1, y: 0 } }),
  );
  assert.throws(() =>
    assertGestureIntent({
      ...map('SELECT', 'START'),
      pointer: { x: 1.1, y: 0 },
    }),
  );
});
test('mapper requires movement payload and copies it; terminal intents cannot carry stale values', () => {
  assert.throws(() => map('ROTATE', 'UPDATE', { delta: undefined }));
  assert.throws(() => map('SELECT', 'UPDATE', { pointer: undefined }));
  const input = context('SELECT', { traceId: 'trace' });
  const output = mapTransition({ phase: 'UPDATE', atMs: 25 }, input);
  input.pointer.x = 0.9;
  assert.equal(output.pointer.x, 0.3);
  assert.equal(output.traceId, 'trace');
  const terminal = map('SELECT', 'CANCEL', { pointer: { x: 0.9, y: 0.9 } });
  assert.equal('pointer' in terminal, false);
});
test('all actual engine modes emit schema-valid unique identities, including cancellation and new sessions', () => {
  const engine = new GestureEngine(),
    intents = [];
  let id = 0;
  for (const gesture of [
    'Open_Palm',
    'Closed_Fist',
    'None',
    'Victory',
    'None',
    'Pointing_Up',
  ]) {
    for (let n = 0; n < 8; n++, id++)
      intents.push(...engine.update(gestureFrame(id, id * 40, { gesture })));
  }
  for (let n = 0; n < 10; n++, id++)
    intents.push(...engine.update(pinchFrame(id, id * 40)));
  assert.equal(
    intents.some((i) => i.kind === 'ZOOM'),
    false,
  );
  // EMA: .29 + (.5 - .29) * .75^10 > .30; frame 11 enters, frame 13 confirms.
  for (let n = 0; n < 3; n++, id++)
    intents.push(...engine.update(pinchFrame(id, id * 40)));
  intents.push(...engine.reset('STOP'));
  for (let n = 0; n < 4; n++)
    intents.push(
      ...engine.update(gestureFrame(n, n * 40, { sessionId: 'new' })),
    );
  assert.equal(new Set(intents.map((i) => i.id)).size, intents.length);
  assert.deepEqual(
    new Set(intents.map((i) => i.kind)),
    new Set(['ROTATE', 'ZOOM', 'PAUSE', 'SELECT', 'RESET']),
  );
  for (const intent of intents) assertGestureIntent(intent);
});
