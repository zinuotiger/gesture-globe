import { test as base, expect } from '@playwright/test';
/** Returning-user camera regressions; onboarding.spec.ts covers genuine first use. */
export const test = base.extend<{ tutorialAlreadyCompleted: void }>({
  tutorialAlreadyCompleted: [
    async ({ page }, use) => {
      await page.addInitScript(() =>
        localStorage.setItem(
          'gesture-globe.onboarding.v1',
          JSON.stringify({ schemaVersion: 1, completed: true }),
        ),
      );
      await use();
    },
    { auto: true },
  ],
});
export { expect };
