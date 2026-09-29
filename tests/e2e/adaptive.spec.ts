import { test, expect } from '../support/returning-user.ts';
import { startFixtureServer } from '../support/vite-fixture.ts';
declare global {
  interface Window {
    adaptiveFixture: {
      advance(
        bad: boolean,
        ms: number,
      ): {
        quality: {
          requested: string;
          effective: string;
          pixelRatioCap: number;
          atmosphere: boolean;
        };
        adaptive: { pressure: number; targetHz: number };
      };
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
test('synthetic sustained pressure changes actual AUTO rendering tier, retains canvas/controls and cautiously restores', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(fixture.origin + '/tests/fixtures/adaptive.html');
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  const canvas = await page.locator('.globe-surface canvas').elementHandle();
  const medium = await page.evaluate(() =>
    window.adaptiveFixture.advance(true, 3000),
  );
  expect(medium.quality.effective).toBe('MEDIUM');
  expect(medium.adaptive.targetHz).toBe(20);
  const low = await page.evaluate(() =>
    window.adaptiveFixture.advance(true, 5000),
  );
  expect(low.quality).toMatchObject({
    requested: 'AUTO',
    effective: 'LOW',
    pixelRatioCap: 1,
    atmosphere: false,
  });
  expect(low.adaptive.targetHz).toBe(15);
  await expect(page.locator('.quality-control')).toContainText('当前低');
  await page.getByRole('button', { name: '向左旋转', exact: true }).click();
  await expect(page.locator('.globe-surface')).toHaveAttribute(
    'data-render-state',
    'rendered',
  );
  expect(
    await canvas!.evaluate(
      (c) => c === document.querySelector('.globe-surface canvas'),
    ),
  ).toBe(true);
  await page.getByLabel('画质', { exact: true }).selectOption('HIGH');
  const manual = await page.evaluate(() =>
    window.adaptiveFixture.advance(true, 5000),
  );
  expect(manual.quality).toMatchObject({
    requested: 'HIGH',
    effective: 'HIGH',
  });
  await page.getByLabel('画质', { exact: true }).selectOption('AUTO');
  const recovered = await page.evaluate(() =>
    window.adaptiveFixture.advance(false, 41000),
  );
  expect(recovered.quality.effective).toBe('HIGH');
  expect(recovered.adaptive.targetHz).toBe(24);
  await expect(page.locator('.quality-control')).toContainText('当前高');
  await page.evaluate(() => window.adaptiveFixture.dispose());
  expect(errors).toEqual([]);
});
