import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/{unit,contract,integration}/**/*.test.mjs'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/config/configSchema.ts', 'src/shared/dto.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 85, branches: 85, functions: 85, statements: 85 },
    },
  },
});
