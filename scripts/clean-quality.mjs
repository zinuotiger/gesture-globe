import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { TextDecoder, isDeepStrictEqual } from 'node:util';
import { readLocalLedger } from './local-ledger.mjs';
import { safePath } from './asset-policy.mjs';
import { buildIdentity, qualityChecks, runChecks } from './quality-gate.mjs';

const root = process.cwd();
const parent = safePath(root, '.gesture-globe/clean-verification');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Use npm run quality:clean');
const task = process.argv[2];
if (task && !/^TASK-\d{3}$/.test(task))
  throw new Error('Invalid clean report task');
const reportPath = safePath(
  root,
  `.gesture-globe/reports/${task ? task + '-' : ''}clean-build-report.json`,
);
await mkdir(parent, { recursive: true });
const scratch = await mkdtemp(path.join(parent, 'quality-clean-'));
const git = (args) => execFileSync('git', args, { cwd: root });
const beforeHead = git(['rev-parse', 'HEAD']);
const beforeState = await readLocalLedger(root);
const beforeStatus = git([
  'status',
  '--porcelain=v1',
  '-z',
  '--untracked-files=all',
]);
const results = [];
let success = false;
let cleanReport = null;
try {
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', root, scratch], {
    cwd: root,
  });
  const files = new TextDecoder('utf-8', { fatal: true })
    .decode(
      git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']),
    )
    .split('\0')
    .filter(Boolean);
  for (const file of new Set(files)) {
    const target = safePath(scratch, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(safePath(root, file), target);
  }
  // Use the copied, existing ignored clean area; compiler caches must not become
  // untracked source changes during the unchanged-Git-state regression tests.
  const temp = safePath(
    scratch,
    '.gesture-globe/clean-verification/runtime-temp',
  );
  await mkdir(temp, { recursive: true });
  const env = {
    ...process.env,
    npm_config_cache: safePath(root, 'node_modules/.cache/npm'),
    TEMP: temp,
    TMP: temp,
    PLAYWRIGHT_BROWSERS_PATH: safePath(
      root,
      'node_modules/.cache/ms-playwright',
    ),
  };
  for (const args of [['ci'], ['run', 'assets:fetch']]) {
    console.log(`CLEAN: npm ${args.join(' ')}`);
    const result = spawnSync(process.execPath, [npmCli, ...args], {
      cwd: scratch,
      env,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    console.log(result.stdout);
    console.error(result.stderr);
    results.push({
      command: ['node', npmCli, ...args],
      exitCode: result.status,
      signal: result.signal,
      output: (result.stdout || '') + (result.stderr || ''),
    });
    if (result.status !== 0)
      throw new Error(`Clean command failed: npm ${args.join(' ')}`);
  }
  const checks = qualityChecks(npmCli);
  checks
    .find((check) => check.name === 'test:integration')
    .args.push('--', '--maxWorkers=1');
  checks
    .find((check) => check.name === 'test:e2e')
    .args.push('--', '--workers=1');
  checks
    .find((check) => check.name === 'test:coverage')
    .args.push('--', '--maxWorkers=1');
  cleanReport = await runChecks(checks, {
    cwd: scratch,
    env,
    identity: {
      ...(await buildIdentity(scratch)),
      browserWorkers: 1,
      integrationWorkers: 1,
      coverageWorkers: 1,
    },
    reportPath: safePath(scratch, '.gesture-globe/reports/build-report.json'),
  });
  if (cleanReport.localQuality !== 'PASS')
    throw new Error('Clean quality gate failed');
  if (
    !beforeHead.equals(git(['rev-parse', 'HEAD'])) ||
    !isDeepStrictEqual(beforeState, await readLocalLedger(root)) ||
    !beforeStatus.equals(
      git(['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    )
  )
    throw new Error('Host state/HEAD/status changed during clean verification');
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        status: 'PASS',
        environment:
          'independent fresh node_modules and Git metadata inside repository',
        browserBinary:
          'repository-local installed Playwright binary reused; browser profile fresh',
        hostUnchanged: { head: true, status: true, ledger: true },
        results,
        cleanReport,
      },
      null,
      2,
    ) + '\n',
  );
  success = true;
} catch (error) {
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        status: 'FAIL',
        error: error.message,
        results,
        cleanReport,
      },
      null,
      2,
    ) + '\n',
  );
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (!scratch.startsWith(parent + path.sep)) {
    console.error('Refusing unsafe cleanup');
    process.exitCode = 1;
  } else {
    await rm(scratch, { recursive: true, force: true });
    console.log(
      `CLEAN QUALITY: ${success ? 'PASS' : 'FAIL'}; temporary checkout removed`,
    );
  }
}
