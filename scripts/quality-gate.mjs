import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';
import { safePath, readManifest, digest } from './asset-policy.mjs';

export async function buildIdentity(root) {
  const pkg = JSON.parse(
    await readFile(safePath(root, 'package.json'), 'utf8'),
  );
  const lockBytes = await readFile(safePath(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const dependencies = {};
  for (const [name, version] of Object.entries({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })) {
    if (
      !/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version) ||
      lock.packages?.[`node_modules/${name}`]?.version !== version
    )
      throw new Error(
        `Dependency must have an exact matching lock version: ${name}`,
      );
    dependencies[name] = version;
  }
  return {
    dependencies,
    lockSha256: digest(lockBytes),
    assetsVersion: (await readManifest(root)).assetsVersion,
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
  };
}

export async function runChecks(
  checks,
  { cwd, reportPath, log = console.log, env = process.env, identity = null },
) {
  const results = [];
  let failed = false;
  for (const check of checks) {
    if (failed) {
      results.push({ ...check, status: 'NOT_RUN', exitCode: null });
      continue;
    }
    log(`QUALITY: ${check.name}`);
    const startedAt = new Date().toISOString();
    const result = await new Promise((resolve) => {
      const child = spawn(check.command, check.args, {
        cwd,
        env,
        shell: false,
        windowsHide: true,
      });
      let output = '';
      let errorMessage = null;
      child.stdout.on('data', (data) => {
        output += data.toString('utf8');
      });
      child.stderr.on('data', (data) => {
        output += data.toString('utf8');
      });
      child.on('error', (error) => {
        errorMessage = error.message;
      });
      child.on('close', (exitCode, signal) =>
        resolve({ exitCode, signal, output, errorMessage }),
      );
    });
    log(result.output);
    const accepted =
      result.exitCode === check.expectedExit &&
      !result.signal &&
      !result.errorMessage;
    failed ||= !accepted;
    results.push({
      ...check,
      ...result,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: accepted
        ? check.expectedExit === 0
          ? 'PASS'
          : 'EXPECTED_BLOCK'
        : 'FAIL',
    });
  }
  const report = {
    schemaVersion: 1,
    identity,
    node: process.version,
    platform: process.platform,
    localQuality: failed ? 'FAIL' : 'PASS',
    publicRelease: 'BLOCKED_PENDING_LICENSE',
    manualAcceptance: 'NOT_RUN',
    results,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  return report;
}
export function qualityChecks(npmCli) {
  return [
    'lint',
    'format:check',
    'typecheck',
    'test:unit',
    'test:contract',
    'test:integration',
    'test:coverage',
    'build',
    'test:e2e',
    'release:verify',
  ].map((name) => ({
    name,
    command: process.execPath,
    args: [
      npmCli,
      'run',
      name,
      ...(process.env.CI && name === 'test:e2e' ? ['--', '--workers=1'] : []),
      ...(process.env.CI && ['test:coverage', 'test:integration'].includes(name)
        ? ['--', '--maxWorkers=1']
        : []),
    ],
    expectedExit: name === 'release:verify' ? 2 : 0,
  }));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    if (!process.env.npm_execpath)
      throw new Error(
        'Use npm run quality so the selected npm CLI is explicit',
      );
    const root = process.cwd();
    const localTemp = safePath(root, 'node_modules/.cache/tmp');
    await mkdir(localTemp, { recursive: true });
    const result = await runChecks(qualityChecks(process.env.npm_execpath), {
      cwd: root,
      identity: await buildIdentity(root),
      reportPath: safePath(root, '.gesture-globe/reports/build-report.json'),
      env: {
        ...process.env,
        TEMP: localTemp,
        TMP: localTemp,
        PLAYWRIGHT_BROWSERS_PATH:
          process.env.PLAYWRIGHT_BROWSERS_PATH ||
          safePath(root, 'node_modules/.cache/ms-playwright'),
      },
    });
    console.log(
      `LOCAL QUALITY: ${result.localQuality}; PUBLIC RELEASE: ${result.publicRelease}`,
    );
    if (result.localQuality !== 'PASS') process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
