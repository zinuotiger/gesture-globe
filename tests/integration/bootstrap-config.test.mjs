import assert from 'node:assert/strict';
import { test } from 'vitest';
import { bootstrapApp } from '../../src/app/index.ts';

test('invalid startup config reaches runtime fallback and can dispose', () => {
  const root = { dataset: {} };
  let received;
  const runtime = bootstrapApp(
    root,
    { app: { hiddenPause: false } },
    (_root, config) => {
      received = config;
      return { dispose() {} };
    },
  );
  assert.equal(runtime.config.app.hiddenPause, true);
  assert.equal(received, runtime.config);
  assert.ok(
    runtime.configIssues.some((issue) => issue.path === 'app.hiddenPause'),
  );
  runtime.dispose();
  assert.equal(root.dataset.appPhase, 'DISPOSING');
});
