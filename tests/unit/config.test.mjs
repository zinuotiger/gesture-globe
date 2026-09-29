import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  defaults,
  parseConfig,
  loadConfig,
  numericRules,
} from '../../src/config/index.ts';
import { bootstrapApp } from '../../src/app/index.ts';

test('bootstrap validates configuration before exposing runtime', () => {
  const app = bootstrapApp(
    { dataset: {} },
    { pinch: { enterRatio: 1 } },
    () => ({ dispose() {} }),
  );
  assert.equal(app.config, defaults);
  assert.ok(
    app.configIssues.some((issue) => issue.path === 'pinch.enterRatio'),
  );
  app.dispose();
});

test('defaults validate, are independent and deeply frozen', () => {
  const value = parseConfig();
  assert.deepEqual(value, defaults);
  assert.notEqual(value, defaults);
  assert.ok(Object.isFrozen(value.pinch));
  assert.throws(() => {
    value.pinch.enterRatio = 0;
  });
  assert.equal(value.features.agent, false);
  assert.equal(value.app.defaultQuality, 'AUTO');
});
for (const [path, raw] of [
  ['pinch.enterRatio', { pinch: { enterRatio: 0.4, exitRatio: 0.35 } }],
  ['openPalm.holdScore', { openPalm: { holdScore: 0.9 } }],
  ['globe.minDistance', { globe: { minDistance: 3, maxDistance: 2 } }],
  ['vision.targetHz', { camera: { frameRateIdeal: 15 } }],
  ['gesture.releaseFrames', { gesture: { releaseFrames: 2.5 } }],
  ['gesture.emaAlpha', { gesture: { emaAlpha: NaN } }],
  ['features', { features: { mockVision: true } }],
  ['schemaVersion', { schemaVersion: 2 }],
  ['assets', { assets: { modelUrl: 'https://untrusted.invalid/model' } }],
]) {
  test(`rejects invalid ${path}`, () => {
    assert.throws(
      () => parseConfig(raw),
      (error) => error.issues.some((i) => i.path === path),
    );
    const loaded = loadConfig(raw);
    assert.equal(loaded.config, defaults);
    assert.ok(loaded.issues.length);
  });
}
test('development injection is explicit and production remains closed', () => {
  assert.equal(
    parseConfig({ features: { mockVision: true } }, 'test').features.mockVision,
    true,
  );
  assert.equal(parseConfig({ features: { agent: true } }).features.agent, true);
  assert.throws(() => parseConfig({ features: { voice: true } }));
  assert.throws(() => parseConfig({ features: { diagnosticsExport: true } }));
});
test('rejects unknown keys, accessors and prototype objects', () => {
  for (const input of [
    null,
    [],
    new Date(),
    JSON.parse('{"__proto__":{}}'),
    {
      get pinch() {
        throw new Error('must not execute');
      },
    },
  ])
    assert.throws(() => parseConfig(input));
});
test('every numeric default has a documented range and unit', () => {
  const visit = (object, prefix = '') => {
    for (const [key, value] of Object.entries(object)) {
      const path = `${prefix}${key}`;
      if (typeof value === 'number') {
        assert.ok(numericRules[path], path);
        assert.ok(numericRules[path].unit);
      } else if (value && typeof value === 'object') visit(value, `${path}.`);
    }
  };
  visit(defaults);
});

test('every numeric setting rejects both bounds, infinity and wrong type', () => {
  const inputAt = (path, value) =>
    path
      .split('.')
      .reverse()
      .reduce((child, key) => ({ [key]: child }), value);
  for (const [path, rule] of Object.entries(numericRules)) {
    for (const value of [rule.min - 1, rule.max + 1, Infinity, 'invalid']) {
      assert.throws(
        () => parseConfig(inputAt(path, value)),
        (error) => error.issues.some((issue) => issue.path === path),
        `${path}: ${value}`,
      );
    }
  }
});

for (const [name, config] of [
  ['enum', { app: { defaultQuality: 'ULTRA' } }],
  ['config version', { configVersion: 'unknown' }],
  ['world landmarks', { vision: { worldLandmarks: true } }],
  ['P0 pause', { app: { hiddenPause: false } }],
  ['polar order', { globe: { minPolar: Math.PI / 2, maxPolar: Math.PI / 2 } }],
  ['initial distance', { globe: { initialDistance: 5 } }],
  ['initial polar', { globe: { initialPolar: 0 } }],
  ['transition duration', { globe: { resetDurationMs: 500 } }],
  ['star clipping', { globe: { farClip: 20 } }],
  ['near clip', { globe: { minDistance: 1.05, nearClip: 0.1 } }],
  ['symbol key', { [Symbol('hidden')]: true }],
]) {
  test(`config rejects ${name}`, () =>
    assert.throws(() => parseConfig(config)));
}
