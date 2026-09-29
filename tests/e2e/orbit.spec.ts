import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { ViewState } from '../../src/shared/index.ts';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
declare global {
  interface Window {
    sceneHarness: {
      view(): ViewState;
      aspect(): number;
      quality(): {
        requested: string;
        effective: string;
        pixelRatioCap: number;
      };
      setQuality(value: string): boolean;
      focus(lat: number, lon: number): boolean;
      reset(): boolean;
      inputs(): number;
      rejectInputs(value: boolean): void;
      unbindKeyboard(): void;
      disable(): void;
      enable(): void;
      dispose(): void;
    };
  }
}
let server: ViteDevServer;
let origin: string;
let cache: string;
const cacheParent = path.resolve('node_modules/.cache');
test('keyboard shortcuts respect real editable, shadow and form focus and dispose cleanly', async ({
  page,
}) => {
  await page.goto(`${origin}/tests/fixtures/scene-harness.html`);
  await expect(page.locator('#scene')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  const canvas = page.locator('canvas');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  const before = await page.evaluate(() => window.sceneHarness.view());
  expect(before.autoRotate).toBe(false);
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(() => page.evaluate(() => window.sceneHarness.view().azimuth))
    .toBeLessThan(before.azimuth);
  await page.keyboard.press('+');
  await expect
    .poll(() => page.evaluate(() => window.sceneHarness.view().distance))
    .toBeLessThan(before.distance);
  await page.keyboard.press('r');
  expect(
    (await page.evaluate(() => window.sceneHarness.view())).transition,
  ).toBe('RESET');
  await page.keyboard.press('Escape');
  expect(
    (await page.evaluate(() => window.sceneHarness.view())).transition,
  ).toBe('IDLE');
  await page.evaluate(() => {
    const panel = document.createElement('div');
    panel.innerHTML =
      '<input id="entry"><textarea id="text"></textarea><select id="choice"><option>A</option><option>B</option></select><div id="editable" contenteditable="true"><span>edit</span></div><button id="semantic">Button</button><div id="shadow"></div>';
    document.body.append(panel);
    document
      .querySelector('#shadow')!
      .attachShadow({ mode: 'open' }).innerHTML = '<input id="shadow-entry">';
  });
  const stopped = await page.evaluate(() => window.sceneHarness.view());
  for (const selector of [
    '#entry',
    '#text',
    '#choice',
    '#editable',
    '#semantic',
    '#shadow-entry',
  ]) {
    await page.locator(selector).focus();
    for (const value of ['ArrowRight', '+', 'r', 'Escape'])
      await page.keyboard.press(value);
    expect(await page.evaluate(() => window.sceneHarness.view())).toEqual(
      stopped,
    );
  }
  await expect(page.locator('#entry')).toHaveValue('+r');
  await canvas.focus();
  expect(
    await canvas.evaluate((node) => {
      const e = new KeyboardEvent('keydown', {
        key: 'r',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });
      return node.dispatchEvent(e);
    }),
  ).toBe(true);
  expect(await page.evaluate(() => window.sceneHarness.view())).toEqual(
    stopped,
  );
  await page.evaluate(() => window.sceneHarness.unbindKeyboard());
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.sceneHarness.view())).toEqual(
    stopped,
  );
});
test('rejected mouse commands cannot mutate the real camera, UI surfaces do not forward dragging', async ({
  page,
}) => {
  await page.goto(`${origin}/tests/fixtures/scene-harness.html`);
  await expect(page.locator('#scene')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  await page.evaluate(() => window.sceneHarness.focus(35, 120));
  await expect
    .poll(() => page.evaluate(() => window.sceneHarness.view().transition))
    .toBe('IDLE');
  await page.evaluate(() => window.sceneHarness.rejectInputs(true));
  const before = await page.evaluate(() => window.sceneHarness.view());
  await page.mouse.move(400, 250);
  await page.mouse.down();
  await page.mouse.move(550, 350, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, -500);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(await page.evaluate(() => window.sceneHarness.view())).toEqual(before);
  expect(
    await page.evaluate(() => window.sceneHarness.inputs()),
  ).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.sceneHarness.disable();
    window.sceneHarness.rejectInputs(false);
    window.sceneHarness.enable();
  });
  const count = await page.evaluate(() => window.sceneHarness.inputs());
  await page.mouse.move(20, 15);
  await page.mouse.down();
  await page.mouse.move(100, 15, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.sceneHarness.inputs())).toBe(count);
  expect(await page.evaluate(() => window.sceneHarness.view())).toEqual(before);
});
test('all quality levels preserve live camera and the same canvas', async ({
  page,
}) => {
  await page.goto(`${origin}/tests/fixtures/scene-harness.html`);
  await expect(page.locator('#scene')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  const result = await page.evaluate(() => {
    const h = window.sceneHarness;
    const canvas = document.querySelector('canvas');
    const view = JSON.stringify(h.view());
    return ['LOW', 'MEDIUM', 'HIGH', 'AUTO'].map((level) => {
      const accepted = h.setQuality(level);
      return {
        accepted,
        same: canvas === document.querySelector('canvas'),
        view: JSON.stringify(h.view()) === view,
        requested: h.quality().requested,
      };
    });
  });
  expect(result).toEqual(
    ['LOW', 'MEDIUM', 'HIGH', 'AUTO'].map((requested) => ({
      accepted: true,
      same: true,
      view: true,
      requested,
    })),
  );
});
test.beforeAll(async () => {
  await mkdir(cacheParent, { recursive: true });
  cache = await mkdtemp(path.join(cacheParent, 'orbit-vite-'));
  server = await createServer({
    cacheDir: cache,
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP server');
  origin = `http://127.0.0.1:${address.port}`;
});

test('DPR cap, container ResizeObserver and actual fullscreen keep projection proportional', async ({
  browser,
}) => {
  const context = await browser.newContext({
    deviceScaleFactor: 3,
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/tests/fixtures/scene-harness.html`);
    await expect(page.locator('#scene')).toHaveAttribute(
      'data-render-state',
      'rendered',
    );
    const dimensions = () =>
      page.evaluate(() => {
        const host = document.querySelector<HTMLElement>('#scene')!;
        const canvas = host.querySelector('canvas')!;
        return {
          width: canvas.width,
          height: canvas.height,
          cssWidth: host.clientWidth,
          cssHeight: host.clientHeight,
          aspect: window.sceneHarness.aspect(),
        };
      });
    expect((await dimensions()).width).toBe(1400);
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('#scene')!;
      host.style.width = '600px';
      host.style.height = '300px';
    });
    await expect.poll(async () => (await dimensions()).width).toBe(1050);
    expect((await dimensions()).aspect).toBe(2);
    await page.locator('#fullscreen').click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.id))
      .toBe('scene');
    await expect
      .poll(async () => {
        const d = await dimensions();
        return (
          d.aspect === d.cssWidth / d.cssHeight &&
          d.width === Math.floor(d.cssWidth * 1.75) &&
          d.height === Math.floor(d.cssHeight * 1.75)
        );
      })
      .toBe(true);
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(async () => (await dimensions()).width).toBe(1050);
    expect((await dimensions()).aspect).toBe(2);
    await page.evaluate(() => window.sceneHarness.dispose());
    await page.setViewportSize({ width: 900, height: 600 });
    await expect(page.locator('#scene canvas')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('focus/reset commands run without media and pointer start cancels transition immediately', async ({
  page,
}) => {
  await page.goto(`${origin}/tests/fixtures/scene-harness.html`);
  await expect(page.locator('#scene')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  expect(await page.evaluate(() => window.sceneHarness.focus(35, 120))).toBe(
    true,
  );
  await expect
    .poll(() => page.evaluate(() => window.sceneHarness.view().transition))
    .toBe('IDLE');
  expect(
    (await page.evaluate(() => window.sceneHarness.view())).polar,
  ).toBeCloseTo(((90 - 35) * Math.PI) / 180, 6);
  expect(await page.evaluate(() => window.sceneHarness.reset())).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.sceneHarness.view().transition))
    .toBe('RESET');
  await page.mouse.move(400, 250);
  await page.mouse.down();
  expect(await page.evaluate(() => window.sceneHarness.view().transition)).toBe(
    'IDLE',
  );
  await page.mouse.up();
  const canceled = await page.evaluate(() => window.sceneHarness.view());
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.evaluate(() => window.sceneHarness.view())).toEqual(
    canceled,
  );
  expect(await page.evaluate(() => window.sceneHarness.reset())).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.sceneHarness.view().transition))
    .toBe('IDLE');
  expect(
    (await page.evaluate(() => window.sceneHarness.view())).distance,
  ).toBeCloseTo(3, 6);
});
test.afterAll(async () => {
  await server?.close();
  if (cache?.startsWith(cacheParent + path.sep))
    await rm(cache, { recursive: true, force: true });
});
test('real OrbitControls drag and wheel update bounded rig, right drag cannot pan, disposal removes canvas', async ({
  page,
}) => {
  await page.goto(`${origin}/tests/fixtures/scene-harness.html`);
  await expect(page.locator('#scene')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  const initial = await page.evaluate(() => window.sceneHarness.view());
  await page.mouse.move(400, 250);
  await page.mouse.down();
  await page.mouse.move(500, 290, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.sceneHarness.view().azimuth))
    .not.toBe(initial.azimuth);
  await page.mouse.wheel(0, -500);
  await expect
    .poll(() => page.evaluate(() => window.sceneHarness.view().distance))
    .toBeLessThan(initial.distance);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(700, 380, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  expect(await page.evaluate(() => window.sceneHarness.view().target)).toEqual({
    x: 0,
    y: 0,
    z: 0,
  });
  await page.mouse.wheel(0, 100000);
  await expect
    .poll(() => page.evaluate(() => window.sceneHarness.view().distance))
    .toBeCloseTo(4, 6);
  await page.evaluate(() => window.sceneHarness.disable());
  const disabled = await page.evaluate(() => window.sceneHarness.view());
  await page.mouse.wheel(0, -1000);
  await page.mouse.down();
  await page.mouse.move(300, 100, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.sceneHarness.view())).toEqual(
    disabled,
  );
  await page.evaluate(() => window.sceneHarness.enable());
  await page.mouse.wheel(0, -500);
  await expect
    .poll(() => page.evaluate(() => window.sceneHarness.view().distance))
    .toBeLessThan(disabled.distance);
  expect(
    await page.evaluate(() => window.sceneHarness.inputs()),
  ).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.sceneHarness.dispose();
    window.sceneHarness.dispose();
  });
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('#scene')).toHaveAttribute(
    'data-render-state',
    'disposed',
  );
});
