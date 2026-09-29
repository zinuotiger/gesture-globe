import {
  readFile,
  readdir,
  lstat,
  realpath,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { TextDecoder } from 'node:util';
import { safePath, digest } from './asset-policy.mjs';

export async function hashEvidenceFiles(root, paths) {
  const resolvedRoot = await realpath(root);
  const entries = [];
  for (const relative of [...new Set(paths)].sort()) {
    const file = safePath(root, relative);
    const actual = await realpath(file);
    if (
      !actual.startsWith(resolvedRoot + path.sep) ||
      (await lstat(file)).isSymbolicLink()
    )
      throw new Error('Evidence must be a regular file inside the repository');
    if (!(await lstat(file)).isFile())
      throw new Error('Evidence must be a regular file');
    const bytes = await readFile(file);
    entries.push({
      path: relative,
      sizeBytes: bytes.length,
      sha256: digest(bytes),
    });
  }
  return entries;
}
export async function createReleaseEvidenceIndex(root) {
  const state = JSON.parse(
    await readFile(safePath(root, '.gesture-globe/state.json'), 'utf8'),
  );
  const docs = [
    'README.md',
    'architecture.md',
    'tuning.md',
    'known-limitations.md',
    'NOTICE.md',
    'demo-script.md',
    'release-validation.md',
    'requirements-traceability.md',
  ];
  const evidence = (
    await readdir(safePath(root, '.gesture-globe/evidence'))
  ).filter((name) => /^TASK-\d{3}\.md$/.test(name));
  const reports = (
    await readdir(safePath(root, '.gesture-globe/reports'))
  ).filter((name) =>
    /^TASK-\d{3}-(quality|deferred|manual-plan)\.json$/.test(name),
  );
  const entries = await hashEvidenceFiles(root, [
    'package.json',
    'package-lock.json',
    'src/config/assets.manifest.json',
    'AGENTS.md',
    'docs/Gesture_Globe_实施级需求规格_v3.0.md',
    '.agents/skills/gesture-globe-delivery/references/task-manifest.json',
    '.agents/skills/gesture-globe-delivery/scripts/gg.py',
    ...new TextDecoder('utf-8', { fatal: true })
      .decode(
        execFileSync(
          'git',
          [
            '-c',
            'core.quotepath=false',
            'ls-files',
            '-z',
            '--cached',
            '--others',
            '--exclude-standard',
            '--',
            'src',
            'scripts',
          ],
          { cwd: root },
        ),
      )
      .split('\0')
      .filter(Boolean),
    ...docs.map((name) => 'docs/' + name),
    ...evidence.map((name) => '.gesture-globe/evidence/' + name),
    ...reports.map((name) => '.gesture-globe/reports/' + name),
    '.gesture-globe/reports/TASK-710-clean-build-report.json',
  ]);
  return {
    schemaVersion: 1,
    task: 'TASK-710',
    phase: 'PRE_ACCEPTANCE_WORKING_SOURCE_SNAPSHOT',
    createdAt: new Date().toISOString(),
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    localEngineering: 'SEE_PINNED_COMMAND_REPORTS',
    manualAcceptance: 'NOT_RUN',
    publicRelease: 'BLOCKED_PENDING_LICENSE',
    distribution: 'INDEX_ONLY_NO_ASSET_COPIES',
    unresolvedAcceptance: Object.entries(state.tasks)
      .filter(([, task]) => task.acceptanceStatus === 'ACCEPTANCE_DEFERRED')
      .map(([id]) => id),
    remainingEngineering: Object.entries(state.tasks)
      .filter(([, task]) => task.engineeringStatus !== 'ENGINEERING_COMPLETE')
      .map(([id]) => id),
    entries,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const report = await createReleaseEvidenceIndex(process.cwd());
  await writeFile(
    safePath(
      process.cwd(),
      '.gesture-globe/reports/TASK-710-evidence-index.json',
    ),
    JSON.stringify(report, null, 2) + '\n',
    { flag: 'wx' },
  );
}
