import process from 'node:process';
import console from 'node:console';
import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  buildIdentity,
  qualityChecks,
  runChecks,
} from '../../scripts/quality-gate.mjs';

// Run every canonical gate unchanged, with one WebGL/WASM browser at a time.
// No retries, longer timeouts, filtered tests, or changed assertions.
// V8 coverage runs one file worker at a time to isolate loopback asset serving.
const npmCli = process.argv[2];
if (!npmCli || !path.isAbsolute(npmCli))
  throw new Error('Pass the absolute path of the already installed npm CLI');
const runtime = await realpath(process.execPath);
const resolvedCli = await realpath(npmCli);
if ([runtime, resolvedCli].some((file) => /[/\\]_npx[/\\]/i.test(file)))
  throw new Error('Downloaded temporary runtimes are forbidden');
const mode = process.argv[3] || 'quality';
const reportPrefix = process.argv[4] || 'TASK-207-recovery';
if (!/^TASK-\d{3}(?:-recovery)?$/.test(reportPrefix))
  throw new Error('Invalid task report prefix');
if (!['quality', 'repeat', 'e2e'].includes(mode))
  throw new Error('Mode must be quality, repeat or e2e');
const root = process.cwd();
const temporary = path.join(root, 'node_modules/.cache/tmp');
const cache = path.join(root, 'node_modules/.cache/npm');
await mkdir(temporary, { recursive: true });
await mkdir(path.join(cache, '_logs'), { recursive: true });
let checks = qualityChecks(resolvedCli);
const browserCheck = checks.find((check) => check.name === 'test:e2e');
browserCheck.args.push('--', '--workers=1');
checks
  .find((check) => check.name === 'test:coverage')
  .args.push('--', '--maxWorkers=1');
if (mode !== 'quality') checks = [browserCheck];
if (mode === 'repeat')
  browserCheck.args.push(
    '--project=chromium-1920',
    '--grep=synthetic browser stream: hide|keyboard focus and semantic activation',
    '--repeat-each=3',
  );
console.log(
  `Trusted runtime: ${runtime} ${process.version}; npm CLI: ${resolvedCli}`,
);
const report = await runChecks(checks, {
  cwd: root,
  identity: {
    ...(await buildIdentity(root)),
    runtime,
    npmCli: resolvedCli,
    mode,
    workers: 1,
    coverageWorkers: 1,
  },
  reportPath: path.join(
    root,
    `.gesture-globe/reports/${reportPrefix}-${mode}.json`,
  ),
  env: {
    ...process.env,
    TEMP: temporary,
    TMP: temporary,
    NPM_CONFIG_CACHE: cache,
    NPM_CONFIG_LOGS_DIR: path.join(cache, '_logs'),
    NPM_CONFIG_OFFLINE: 'true',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    PLAYWRIGHT_BROWSERS_PATH: path.join(
      root,
      'node_modules/.cache/ms-playwright',
    ),
  },
});
console.log(
  `LOCAL QUALITY: ${report.localQuality}; PUBLIC RELEASE: ${report.publicRelease}`,
);
if (report.localQuality !== 'PASS') process.exitCode = 1;
