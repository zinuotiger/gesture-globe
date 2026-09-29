import assert from 'node:assert/strict';
import { test } from 'vitest';
import { PrimaryHandSelector } from '../../src/gesture/index.ts';
import { parseConfig } from '../../src/config/index.ts';
import { syntheticFrame } from '../fixtures/vision-sequences.mjs';
function hand(center, confidence = 0.9, side = 'Right') {
  const h = syntheticFrame().hands[0];
  h.handedness = side;
  h.handednessScore = confidence;
  h.gestures[0].score = confidence;
  h.landmarks = h.landmarks.map((p) => ({
    ...p,
    x: center + (p.x - 0.4) * 1.1,
    y: 0.4 + (p.y - 0.4) * 1.1,
  }));
  return h;
}
const frame = (id, time, hands, session = 's') => ({
  ...syntheticFrame(id),
  sessionId: session,
  captureTimeMs: time,
  resultTimeMs: time + 1,
  hands,
});
test('retains nearest hand across array/localId/handedness swaps and score jitter during and after lock', () => {
  const selector = new PrimaryHandSelector();
  const first = selector.select(
    frame(0, 0, [hand(0.25, 0.92), hand(0.75, 0.9, 'Left')]),
  );
  assert.ok(first);
  assert.equal(first.changed, true);
  for (let i = 1; i < 30; i++) {
    const primary = hand(0.25 + (i % 2) * 0.001, 0.9, i % 2 ? 'Left' : 'Right');
    primary.localId = `random-slot-${i}`;
    const challenger = hand(0.75, 0.95);
    const result = selector.select(
      frame(i, i * 40, i % 2 ? [challenger, primary] : [primary, challenger]),
    );
    assert.equal(result.localId, first.localId);
    assert.equal(result.changed, false);
    assert.ok(result.features.palm.x < 0.4);
  }
});
test('short occlusion returns no control; after 180ms loss another hand gets a new session-local id', () => {
  const selector = new PrimaryHandSelector();
  const a = selector.select(frame(0, 0, [hand(0.25)]));
  assert.equal(selector.select(frame(1, 100, [hand(0.75)])), undefined);
  const returned = selector.select(frame(2, 150, [hand(0.25)]));
  assert.equal(returned.localId, a.localId);
  assert.equal(selector.select(frame(3, 200, [])), undefined);
  assert.equal(selector.select(frame(4, 329, [hand(0.75)])), undefined);
  const takeover = selector.select(frame(5, 330, [hand(0.75)]));
  assert.notEqual(takeover.localId, a.localId);
  assert.equal(takeover.changed, true);
  const nextSession = selector.select(frame(0, 0, [hand(0.75)], 'new'));
  assert.match(nextSession.localId, /^new:hand-1$/);
  selector.reset();
  assert.equal(selector.getState().localId, undefined);
});
test('high-quality challenger cannot steal a weak but valid primary before lock expires; switch renews lock', () => {
  const selector = new PrimaryHandSelector();
  const challenger = () => {
    const h = hand(0.75, 1);
    h.landmarks = h.landmarks.map((p) => ({
      ...p,
      x: 0.75 + (p.x - 0.75) * 2,
      y: 0.4 + (p.y - 0.4) * 2,
    }));
    return h;
  };
  const first = selector.select(frame(0, 0, [hand(0.25, 0.65)]));
  for (let i = 1; i < 10; i++)
    assert.equal(
      selector.select(frame(i, i * 50, [hand(0.25, 0.65), challenger()]))
        .localId,
      first.localId,
    );
  const changed = selector.select(
    frame(10, 500, [hand(0.25, 0.65), challenger()]),
  );
  assert.notEqual(changed.localId, first.localId);
  assert.equal(selector.getState().lockedUntilMs, 1000);
});
test('invalid confidence, geometry, stale/order/session metadata never produce a controlling selection', () => {
  const selector = new PrimaryHandSelector();
  for (const bad of [
    hand(0.25, 0),
    hand(0.25, NaN),
    hand(-0.5),
    { ...hand(0.25), landmarks: [] },
    { ...hand(0.25), gestures: [{ name: 'x', score: Infinity }] },
  ]) {
    selector.reset();
    assert.equal(selector.select(frame(0, 0, [bad])), undefined);
  }
  selector.reset();
  const f = frame(1, 100, [hand(0.25)]);
  assert.ok(selector.select(f));
  for (const bad of [
    f,
    { ...f, frameId: 0 },
    { ...f, frameId: 2, captureTimeMs: 99 },
    { ...f, frameId: 2, resultTimeMs: 251 },
    { ...f, frameId: 2, schemaVersion: 2 },
    { ...f, sessionId: '' },
    { ...f, frameId: NaN },
  ])
    assert.equal(selector.select(bad), undefined);
  assert.equal(selector.select(frame(2, 101, [hand(0.25, 1.1)])), undefined);
  assert.equal(
    selector.select(
      frame(3, 102, [hand(0.25, 1), hand(0.5, 1), hand(0.75, 1)]),
    ),
    undefined,
  );
  assert.throws(() => parseConfig({ handTracking: { sizeWeight: 0.5 } }));
});
test('equal quality selection is deterministic under input order; no fixed handedness preference', () => {
  const a = hand(0.25, 0.9, 'Left'),
    b = hand(0.75, 0.9, 'Right');
  const x = new PrimaryHandSelector().select(frame(0, 0, [a, b]));
  const y = new PrimaryHandSelector().select(frame(0, 0, [b, a]));
  assert.equal(x.features.palm.x, y.features.palm.x);
  assert.equal(
    new PrimaryHandSelector().select(frame(0, 0, [hand(0.5, 0.9, 'Left')])).hand
      .handedness,
    'Left',
  );
  assert.equal(
    new PrimaryHandSelector().select(frame(0, 0, [hand(0.5, 0.9, 'Right')]))
      .hand.handedness,
    'Right',
  );
});
