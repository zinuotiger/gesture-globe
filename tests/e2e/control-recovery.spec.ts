import { test, expect } from '@playwright/test';
import { startFixtureServer } from '../support/vite-fixture.ts';
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
});
test.afterAll(async () => {
  await fixture?.close();
});

test('actual wheel input changes radius monotonically without rotating or moving the zoom center', async ({
  page,
}) => {
  await page.goto(fixture.origin + '/tests/fixtures/scene-harness.html');
  await page.waitForFunction(() => !!window.sceneHarness);
  await page.evaluate(() => window.sceneHarness.focus(20, 60));
  await expect
    .poll(() => page.evaluate(() => window.sceneHarness.view().transition))
    .toBe('IDLE');
  await page.mouse.move(400, 250);
  for (const direction of [-1, 1]) {
    const before = await page.evaluate(() => window.sceneHarness.view());
    const recording = page.evaluate(async () => {
      const frames = [];
      for (let i = 0; i < 75; i++) {
        await new Promise(requestAnimationFrame);
        frames.push(window.sceneHarness.view());
      }
      return frames;
    });
    await page.mouse.wheel(0, direction * 120);
    const frames = await recording;
    expect(
      direction * (frames.at(-1)!.distance - before.distance),
    ).toBeGreaterThan(0.05);
    let previous = before;
    for (const view of frames) {
      expect(
        direction * (view.distance - previous.distance),
      ).toBeGreaterThanOrEqual(-1e-10);
      expect(view.azimuth).toBeCloseTo(before.azimuth, 10);
      expect(view.polar).toBeCloseTo(before.polar, 10);
      expect(view.target).toEqual({ x: 0, y: 0, z: 0 });
      previous = view;
    }
  }
});

test('in-page animated and static hand guide stays beside the live view, supports keyboard and reduced motion', async ({
  page,
}) => {
  await page.goto(fixture.origin + '/');
  const open = page.getByRole('button', { name: '手势图解', exact: true });
  await open.click();
  const guide = page.getByRole('region', { name: '手势图解' });
  await expect(guide).toBeVisible();
  const select = page.getByRole('combobox', { name: '选择手势图解' });
  await expect(select).toBeFocused();
  const drawings = [];
  for (const id of ['palm', 'pinch', 'fist', 'point', 'victory']) {
    await select.selectOption(id);
    await expect(guide.getByRole('img')).toBeVisible();
    drawings.push(await guide.locator('svg').innerHTML());
    for (const label of ['摆手：', '动作：', '触发：', '效果：'])
      await expect(guide).toContainText(label);
  }
  expect(new Set(drawings).size).toBe(5);
  await select.selectOption('pinch');
  await expect(guide).toContainText('上移放大、下移缩小');
  await expect(guide.locator('.guide-hand')).toHaveCSS(
    'animation-name',
    'guide-up',
  );
  await guide.getByRole('button', { name: '切换静态图' }).click();
  await expect(guide.locator('.guide-hand')).toHaveCSS(
    'animation-name',
    'none',
  );
  await guide.getByRole('button', { name: '播放动作示意' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(guide.locator('.guide-hand')).toHaveCSS(
    'animation-name',
    'none',
  );
  const boxes = await page.evaluate(() => {
    const rect = (s: string) => {
      const b = document.querySelector(s)!.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
    };
    return {
      guide: rect('.gesture-guide'),
      globe: rect('.globe-surface'),
      actions: rect('.camera-actions'),
    };
  });
  expect(boxes.guide.top).toBeGreaterThanOrEqual(boxes.globe.bottom - 1);
  expect(boxes.actions.bottom).toBeLessThanOrEqual(boxes.guide.top);
  await expect(page.locator('.camera-panel')).toHaveAttribute(
    'data-camera-state',
    'OFF',
  );
  await select.focus();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await page.screenshot({
    path: test.info().outputPath('gesture-guide.png'),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(guide.getByRole('button', { name: '收起图解' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await guide.getByRole('button', { name: '收起图解' }).click();
  await expect(open).toBeFocused();
});
