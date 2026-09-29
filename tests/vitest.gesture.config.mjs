import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/unit/landmark-math.test.mjs'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'src/shared/landmarkMath.ts',
        'src/gesture/features/extractFeatures.ts',
      ],
      reportsDirectory: 'coverage/gesture',
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 85, branches: 85, functions: 85, statements: 85 },
    },
  },
});
