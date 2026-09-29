import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runChecks } from '../../scripts/quality-gate.mjs';

test('quality report records real exits, expected release denial and stops after failure', async () => {
  const parent = path.resolve('node_modules/.cache');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'quality-test-'));
  try {
    const checks = [0, 2, 1, 0].map((code, index) => ({
      name: `probe-${index}`,
      command: process.execPath,
      args: ['-e', `process.exit(${code})`],
      expectedExit: index === 1 ? 2 : 0,
    }));
    const reportPath = path.join(root, 'report.json');
    const result = await runChecks(checks, {
      cwd: root,
      reportPath,
      log: () => {},
    });
    assert.deepEqual(
      result.results.map((r) => r.status),
      ['PASS', 'EXPECTED_BLOCK', 'FAIL', 'NOT_RUN'],
    );
    assert.equal(result.localQuality, 'FAIL');
    assert.equal(result.publicRelease, 'BLOCKED_PENDING_LICENSE');
    assert.equal(result.results[3].exitCode, null);
    assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), result);
  } finally {
    assert.ok(root.startsWith(parent + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});
