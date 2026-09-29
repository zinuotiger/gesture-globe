import { test, expect } from '@playwright/test';
import { startFixtureServer } from '../support/vite-fixture.ts';
declare global {
  interface Window {
    markerFixture: {
      sample(front: boolean): { visible: boolean; pixel: number[] };
      dispose(): void;
    };
  }
}
let fixture: Awaited<ReturnType<typeof startFixtureServer>>;
test.beforeAll(async () => {
  fixture = await startFixtureServer();
});
test.afterAll(async () => {
  await fixture?.close();
});
test('actual WebGL pixels show the front marker and conceal the back marker', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.origin + '/tests/fixtures/marker-harness.html');
  await page.waitForFunction(() => !!window.markerFixture);
  const front = await page.evaluate(() => window.markerFixture.sample(true));
  const back = await page.evaluate(() => window.markerFixture.sample(false));
  expect(front.visible).toBe(true);
  expect(back.visible).toBe(false);
  expect(front.pixel[0]!).toBeGreaterThan(back.pixel[0]! + 100);
  expect(front.pixel[1]!).toBeGreaterThan(back.pixel[1]! + 100);
  await page.evaluate(() => window.markerFixture.dispose());
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
