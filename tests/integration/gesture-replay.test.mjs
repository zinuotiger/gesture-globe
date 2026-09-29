import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GestureEngine } from '../../src/gesture/index.ts';
import { isPlainDto } from '../../src/shared/index.ts';
import { defaults } from '../../src/config/index.ts';
import { gestureFrame } from '../fixtures/gesture-frames.mjs';
import {
  gestureReplayFixture,
  replayNames,
} from '../fixtures/gesture-replays.mjs';
import { runGestureReplay } from '../support/gesture-replay.mjs';
for (const name of replayNames)
  test(`synthetic replay ${name} is deterministic and has a bounded redacted debug snapshot`, () => {
    const input = gestureReplayFixture(name);
    const before = JSON.stringify(input);
    const a = runGestureReplay(input),
      b = runGestureReplay(input);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(input), before);
    assert.equal(a.configVersion, defaults.configVersion);
    assert.match(a.configSha256, /^[a-f0-9]{64}$/);
    for (const row of a.rows) {
      assert.ok(isPlainDto(row.debug));
      assert.ok(Object.isFrozen(row.debug));
      const debug = JSON.stringify(row.debug);
      assert.ok(debug.length < 1200);
      assert.equal(
        /landmarks|worldLandmarks|video|deviceId|frames/.test(debug),
        false,
      );
    }
    const intents = a.rows.flatMap((r) => r.intents);
    if (name === 'five-gestures')
      assert.deepEqual(
        new Set(intents.map((i) => i.kind)),
        new Set(['ROTATE', 'PAUSE', 'RESET', 'SELECT', 'ZOOM']),
      );
    if (name === 'priority')
      assert.deepEqual(
        intents.map((i) => `${i.kind}:${i.phase}`),
        ['PAUSE:START'],
      );
    if (name === 'two-hands')
      assert.equal(new Set(intents.map((i) => i.sourceHandId)).size, 1);
    if (name === 'loss')
      assert.deepEqual(
        intents.filter((i) => i.phase !== 'UPDATE').map((i) => i.phase),
        ['START', 'END', 'START'],
      );
    if (name === 'gap' || name === 'reacquire-gap') {
      assert.equal(
        a.rows[5].debug.resetReason,
        name === 'gap' ? 'GAP' : 'HAND_CHANGED',
      );
      assert.deepEqual(
        a.rows[5].intents.map((i) => i.phase),
        ['CANCEL'],
      );
      assert.deepEqual(a.rows.at(-1).intents[0].delta, { x: 0, y: 0 });
    }
    if (name === 'stationary-60s') {
      assert.equal(intents.filter((i) => i.phase === 'START').length, 1);
      assert.equal(
        intents.some((i) => i.phase === 'TRIGGER'),
        false,
      );
      assert.ok(intents.every((i) => i.delta.x === 0 && i.delta.y === 0));
    }
  });
test('debug state represents active Pointing and Victory rather than stale rotation state', () => {
  const e = new GestureEngine();
  assert.ok(isPlainDto(e.getDebugState()));
  e.update(gestureFrame(0, 0, { gesture: 'Pointing_Up' }));
  assert.equal(e.getDebugState().activeGesture, 'SELECT');
  assert.equal(e.getDebugState().phase, 'ACTIVE');
  assert.equal(e.getDebugState().stableFrames, 1);
  e.update(gestureFrame(1, 40, { gesture: 'Victory' }));
  assert.equal(e.getDebugState().candidate, 'Victory');
  assert.equal(e.getDebugState().phase, 'CANDIDATE');
  e.update({ ...gestureFrame(2, 80), hands: [] });
  assert.equal(e.getDebugState().candidate, 'None');
  assert.equal(e.getDebugState().primaryHandId, null);
  assert.equal(e.getDebugState().handPresent, false);
  e.reset();
  assert.equal(e.getDebugState().frameId, null);
  assert.equal(e.getDebugState().activeGesture, 'NONE');
});
test('replay refuses camera provenance, missing data and mismatched config instead of pretending success', () => {
  const good = gestureReplayFixture('loss');
  for (const patch of [
    { source: 'camera' },
    { configVersion: 'other' },
    { frames: [] },
    { schemaVersion: 2 },
  ])
    assert.throws(() => runGestureReplay({ ...good, ...patch }));
});
