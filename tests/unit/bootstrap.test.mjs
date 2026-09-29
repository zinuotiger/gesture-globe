import assert from 'node:assert/strict';
import { test } from 'vitest';
import { bootstrapApp } from '../../src/app/bootstrap.ts';

test('missing mount root fails explicitly', () => {
  assert.throws(() => bootstrapApp(null), /application root/);
});

test('bootstrap starts in BOOT and disposal is idempotent without media access', () => {
  const root = { dataset: {} };
  let disposals = 0;
  const runtime = bootstrapApp(root, undefined, () => ({
    dispose() {
      disposals++;
    },
  }));
  assert.equal(root.dataset.appPhase, 'BOOT');
  runtime.dispose();
  runtime.dispose();
  assert.equal(root.dataset.appPhase, 'DISPOSING');
  assert.equal(disposals, 1);
});
