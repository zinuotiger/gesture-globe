import assert from 'node:assert/strict';
import { test } from 'vitest';
import { mapIntent } from '../../src/interaction/index.ts';
import { CameraRig, CommandExecutor } from '../../src/globe/index.ts';
import { defaults } from '../../src/config/index.ts';
test('mapped commands reach the real pure view executor with rate-invariant small motion and fail without mutation', () => {
  const results = [];
  for (const hz of [15, 30, 60]) {
    const rig = new CameraRig(defaults),
      executor = new CommandExecutor(rig, defaults);
    for (let i = 0; i < hz; i++) {
      const at = (i * 1000) / hz;
      const envelope = {
        schemaVersion: 1,
        id: `g-${i}`,
        source: 'gesture',
        kind: 'ZOOM',
        phase: 'UPDATE',
        timestampMs: at,
        payload: {
          sessionId: 's',
          sourceHandId: 'h',
          confidence: 1,
          delta: 0.05 / hz,
          dt: 1 / hz,
        },
      };
      const mapped = mapIntent(envelope, {
        nowMs: at,
        view: executor.getViewState(),
      });
      assert.equal(mapped.ok, true);
      assert.equal(executor.execute(mapped.action.command, at), true);
    }
    results.push(rig.getView().distance);
    const before = rig.getView();
    const bad = mapIntent(
      {
        schemaVersion: 1,
        id: 'bad',
        source: 'ui',
        kind: 'ROTATE',
        phase: 'UPDATE',
        timestampMs: 1000,
        payload: { yaw: Infinity, pitch: 0, dt: 1 },
      },
      { nowMs: 1000 },
    );
    assert.equal(bad.ok, false);
    assert.equal(rig.getView(), before);
  }
  for (const distance of results)
    assert.ok(Math.abs(distance - 3 * Math.exp(0.05)) < 1e-10);
});
