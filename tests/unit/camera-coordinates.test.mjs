import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  CoordinateAdapter,
  computeObjectFitRect,
} from '../../src/camera/index.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';
test('landscape/portrait cover and contain calculate centered crop or letterbox', () => {
  const cover = computeObjectFitRect(
    { width: 1280, height: 720 },
    { width: 320, height: 240 },
    'cover',
  );
  const expected = {
    x: -160 / 3,
    y: 0,
    width: 1280 / 3,
    height: 240,
    scale: 1 / 3,
  };
  for (const key of Object.keys(expected))
    assert.ok(
      Math.abs(cover[key] - expected[key]) <=
        4 * Number.EPSILON * Math.max(1, Math.abs(expected[key])),
      key,
    );
  assert.equal(2 * cover.x + cover.width, 320);
  assert.deepEqual(
    computeObjectFitRect(
      { width: 1280, height: 720 },
      { width: 320, height: 240 },
      'contain',
    ),
    { x: 0, y: 30, width: 320, height: 180, scale: 0.25 },
  );
  const portrait = computeObjectFitRect(
    { width: 720, height: 1280 },
    { width: 320, height: 240 },
    'cover',
  );
  assert.equal(portrait.width, 320);
  assert.ok(portrait.y < 0);
  assert.equal(portrait.x, 0);
  assert.equal(
    computeObjectFitRect(
      { width: 0, height: 720 },
      { width: 320, height: 240 },
      'cover',
    ),
    undefined,
  );
});
test('mirror occurs once, round trips visible points, cropped and letterbox regions reject', () => {
  for (const mirror of [true, false]) {
    const c = new CoordinateAdapter(
      { width: 1280, height: 720 },
      { width: 320, height: 240 },
      parseConfig({ camera: { previewMirror: mirror } }),
      'contain',
    );
    const p = { x: 0.25, y: 0.5 };
    const display = c.modelToDisplay(p);
    assert.deepEqual(display, { x: mirror ? 240 : 80, y: 120 });
    assert.deepEqual(c.displayToModel(display), p);
    assert.deepEqual(p, { x: 0.25, y: 0.5 });
    assert.equal(c.displayToModel({ x: 160, y: 10 }), undefined);
    assert.equal(c.modelToDisplay({ x: NaN, y: 0 }), undefined);
  }
  const cover = new CoordinateAdapter(
    { width: 1280, height: 720 },
    { width: 320, height: 240 },
    defaults,
  );
  assert.equal(cover.modelToDisplay({ x: 0, y: 0.5 }), undefined);
  assert.deepEqual(cover.modelToDisplay({ x: 0.5, y: 0.5 }), {
    x: 160,
    y: 120,
  });
});
test('preview-to-canvas maps proportional CSS pixels with fresh viewport offsets and safe inset', () => {
  const c = new CoordinateAdapter(
    { width: 640, height: 480 },
    { width: 320, height: 240 },
    defaults,
  );
  const canvas = { x: 600, y: 90, width: 800, height: 600 };
  assert.deepEqual(c.displayToCanvas({ x: 160, y: 120 }, canvas), {
    local: { x: 400, y: 300 },
    client: { x: 1000, y: 390 },
  });
  assert.deepEqual(c.displayToCanvas({ x: 0, y: 0 }, canvas), {
    local: { x: 64, y: 48 },
    client: { x: 664, y: 138 },
  });
  assert.deepEqual(
    c.displayToCanvas(
      { x: 320, y: 240 },
      { x: 10, y: 20, width: 400, height: 300 },
      'fullViewport',
    ),
    { local: { x: 400, y: 300 }, client: { x: 410, y: 320 } },
  );
  assert.equal(c.displayToCanvas({ x: -1, y: 0 }, canvas), undefined);
  assert.equal(
    c.displayToCanvas({ x: 0, y: 0 }, { ...canvas, width: 0 }),
    undefined,
  );
});
