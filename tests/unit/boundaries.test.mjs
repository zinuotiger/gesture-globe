import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint();
for (const [name, filePath, code] of [
  [
    'private import',
    'src/ui/example.ts',
    "import { x } from '../app/bootstrap.ts'; export { x };",
  ],
  [
    'reverse import',
    'src/config/example.ts',
    "export * from '../app/index.ts';",
  ],
  ['Vision to Three', 'src/vision/example.ts', "export * from 'three';"],
  [
    'dynamic bypass',
    'src/gesture/example.ts',
    "export const load = () => import('../camera/index.ts');",
  ],
  [
    'UI to model',
    'src/ui/example.ts',
    "export * from '@mediapipe/tasks-vision';",
  ],
]) {
  test(`boundary rejects ${name}`, async () => {
    const [result] = await eslint.lintText(code, { filePath });
    assert.ok(result.messages.some((m) => m.ruleId === 'boundaries/imports'));
  });
}
test('public DTO import is accepted', async () => {
  const [result] = await eslint.lintText(
    "export * from '../shared/index.ts';",
    { filePath: 'src/gesture/example.ts' },
  );
  assert.equal(result.errorCount, 0);
});
test('Gesture cannot access DOM globals', async () => {
  const [result] = await eslint.lintText('export const root = document.body;', {
    filePath: 'src/gesture/example.ts',
  });
  assert.ok(result.messages.some((m) => m.ruleId === 'no-restricted-globals'));
});
