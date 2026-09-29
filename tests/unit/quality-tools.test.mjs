import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ESLint } from 'eslint';

test('lint rejects explicit any in core TypeScript', async () => {
  const eslint = new ESLint();
  const [result] = await eslint.lintText('export const value: any = 1;\n', {
    filePath: 'src/shared/example.ts',
  });
  assert.ok(
    result.messages.some(
      (m) => m.ruleId === '@typescript-eslint/no-explicit-any',
    ),
  );
});

test('lint accepts a typed public contract', async () => {
  const eslint = new ESLint();
  const [result] = await eslint.lintText('export const value: number = 1;\n', {
    filePath: 'src/shared/example.ts',
  });
  assert.equal(result.errorCount, 0);
});
