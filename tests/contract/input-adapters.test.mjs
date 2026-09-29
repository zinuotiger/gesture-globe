import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  InputRouter,
  createInputAdapter,
  gestureToInput,
  parseInputIntent,
} from '../../src/interaction/index.ts';
import { mapTransition } from '../../src/gesture/index.ts';
const gesture = (kind = 'ROTATE', phase = 'UPDATE') =>
  mapTransition(
    { phase, atMs: 100 },
    {
      id: `g-${phase}`,
      sessionId: 'session',
      sourceHandId: 'hand',
      kind,
      confidence: 0.9,
      delta: { x: 0.01, y: -0.02 },
      pointer: { x: 0.4, y: 0.5 },
    },
  );
test('five sources enter the same owned InputIntent boundary, without a view or model dependency', () => {
  const received = [],
    router = new InputRouter((intent) => received.push(intent));
  for (const source of ['mouse', 'keyboard', 'ui', 'agent']) {
    const adapter = createInputAdapter(source, router, () => 100, 'session');
    assert.equal(adapter.send('RESET', 'TRIGGER', {}).accepted, true);
    assert.equal(adapter.send('CANCEL', 'TRIGGER', {}).accepted, true);
  }
  assert.equal(router.dispatch(gestureToInput(gesture(), 0.04)).accepted, true);
  assert.deepEqual(
    new Set(received.map((i) => i.source)),
    new Set(['mouse', 'keyboard', 'ui', 'agent', 'gesture']),
  );
  assert.equal(new Set(received.map((i) => i.id)).size, received.length);
  const last = received.at(-1);
  assert.deepEqual(last.payload, {
    sessionId: 'session',
    sourceHandId: 'hand',
    confidence: 0.9,
    dt: 0.04,
    yaw: 0.01,
    pitch: -0.02,
  });
  assert.equal(Object.isFrozen(last.payload), true);
});
test('gesture adapter maps every phase without stale terminal payload or fake time; SELECT remains pointer-only', () => {
  assert.equal(gestureToInput(gesture('ZOOM'), 0.04).payload.delta, -0.02);
  assert.deepEqual(gestureToInput(gesture('SELECT'), 0).payload.pointer, {
    x: 0.4,
    y: 0.5,
  });
  for (const kind of ['ROTATE', 'ZOOM', 'SELECT', 'PAUSE']) {
    const terminal = gestureToInput(gesture(kind, 'CANCEL'), 0);
    assert.deepEqual(Object.keys(terminal.payload).sort(), [
      'confidence',
      'sessionId',
      'sourceHandId',
    ]);
  }
  assert.equal(gestureToInput(gesture('RESET', 'TRIGGER'), 0).phase, 'TRIGGER');
  assert.equal(gestureToInput(gesture('NONE', 'END'), 0), undefined);
  for (const dt of [NaN, Infinity, -1, 0])
    assert.throws(() => gestureToInput(gesture(), dt));
});
test('invalid envelope/privacy payload, handler failure and disposal are explicit; a later event still works', () => {
  let count = 0;
  const router = new InputRouter(() => {
    if (++count === 1) throw new Error('handler fault');
  });
  const good = {
    schemaVersion: 1,
    id: 'i',
    source: 'ui',
    kind: 'RESET',
    phase: 'TRIGGER',
    timestampMs: 0,
    payload: {},
  };
  for (const patch of [
    { schemaVersion: 2 },
    { source: 'network' },
    { kind: '__proto__' },
    { phase: 'UPDATE' },
    { timestampMs: NaN },
    { payload: { landmarks: [] } },
    { payload: [] },
  ])
    assert.equal(
      router.dispatch({ ...good, ...patch }).reason,
      'INVALID_INPUT',
    );
  assert.equal(count, 0);
  assert.equal(
    router.dispatch({
      ...good,
      kind: 'ROTATE',
      phase: 'UPDATE',
      payload: { yaw: { mutable: 1 } },
    }).reason,
    'INVALID_INPUT',
  );
  assert.equal(router.dispatch(good).reason, 'HANDLER_FAILED');
  assert.equal(router.dispatch({ ...good, id: 'next' }).reason, 'ACCEPTED');
  router.dispose();
  assert.equal(router.dispatch(good).reason, 'DISPOSED');
  assert.equal(count, 2);
});
test('consumer ignores new optional envelope fields but owns pointer and preserves trace identity', () => {
  const g = { ...gesture('SELECT'), traceId: 'trace' };
  const input = gestureToInput(g, 0);
  const parsed = parseInputIntent({ ...input, futureOptional: 'ignored' });
  assert.equal(parsed.traceId, 'trace');
  assert.equal('futureOptional' in parsed, false);
  g.pointer.x = 0.9;
  assert.equal(parsed.payload.pointer.x, 0.4);
  assert.throws(() => {
    parsed.payload.pointer.x = 0;
  });
  assert.throws(() =>
    createInputAdapter('gesture', new InputRouter(() => {}), () => 0, 's'),
  );
  assert.throws(() =>
    createInputAdapter('mouse', new InputRouter(() => {}), () => 0, ' '),
  );
});
