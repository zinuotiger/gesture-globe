import assert from 'node:assert/strict';
import { test } from 'vitest';
import { defaults, parseConfig } from '../../src/config/index.ts';
import { QualityManager } from '../../src/globe/QualityManager.ts';
test('quality maps all requests to bounded effective parameters and rejects invalid input', () => {
  const q = new QualityManager(defaults);
  for (const [requested, effective, cap] of [
    ['LOW', 'LOW', 1],
    ['MEDIUM', 'MEDIUM', 1.5],
    ['HIGH', 'HIGH', 1.75],
    ['AUTO', 'HIGH', 1.75],
  ]) {
    assert.equal(q.set(requested), true);
    assert.deepEqual(q.getState(), {
      requested,
      effective,
      pixelRatioCap: cap,
      atmosphere: effective !== 'LOW',
      clouds: false,
      postProcessing: false,
    });
  }
  const previous = q.getState();
  for (const value of [null, {}, 'ULTRA', Infinity])
    assert.equal(q.set(value), false);
  assert.deepEqual(q.getState(), previous);
  assert.ok(Object.isFrozen(q.getState()));
  const bounded = new QualityManager(
    parseConfig({
      globe: { maxPixelRatio: 1 },
      quality: { autoInitial: 'MEDIUM' },
    }),
  );
  assert.equal(bounded.getState().pixelRatioCap, 1);
  assert.throws(() => parseConfig({ quality: { autoInitial: 'AUTO' } }));
});
