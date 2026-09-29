import { test, afterEach, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  readdir,
} from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import process from 'node:process';
import {
  parseManifest,
  digest,
  modelNotice,
  verifyAssets,
  auditDistribution,
  listFiles,
  MODEL_URL,
} from '../../scripts/asset-policy.mjs';
import { fetchAssets } from '../../scripts/fetch-assets.mjs';
import { bundleAssets } from '../../scripts/bundle-assets.mjs';
import { readLocalLedger } from '../../scripts/local-ledger.mjs';

const repo = process.cwd();
const scratchParent = path.join(repo, 'node_modules/.cache');
const syntheticBytes = Buffer.from(
  'Unit-test-only synthetic model bytes; never production recognition',
);
const fixtureRoots = [];
const actual = JSON.parse(
  await readFile('src/config/assets.manifest.json', 'utf8'),
);
const git = (root, args) => execFileSync('git', args, { cwd: root });
let hostStatus;
let hostHead;
let hostLedger;
beforeAll(async () => {
  hostStatus = git(repo, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  hostHead = git(repo, ['rev-parse', 'HEAD']);
  hostLedger = await readLocalLedger(repo);
});
afterAll(async () => {
  assert.deepEqual(
    git(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    hostStatus,
  );
  assert.deepEqual(git(repo, ['rev-parse', 'HEAD']), hostHead);
  assert.deepEqual(await readLocalLedger(repo), hostLedger);
});
afterEach(async () => {
  for (const dir of fixtureRoots.splice(0)) {
    assert.ok(dir.startsWith(scratchParent + path.sep));
    await rm(dir, { recursive: true, force: true });
    await assert.rejects(readdir(dir), { code: 'ENOENT' });
  }
});
async function fixture() {
  await mkdir(scratchParent, { recursive: true });
  const root = await mkdtemp(path.join(scratchParent, 'assets-test-'));
  fixtureRoots.push(root);
  for (const dir of ['src/config', 'public/models', 'docs', 'dist'])
    await mkdir(path.join(root, dir), { recursive: true });
  const manifest = globalThis.structuredClone(actual);
  Object.assign(manifest.entries[0], {
    sha256: digest(syntheticBytes),
    sizeBytes: syntheticBytes.length,
    fetchedAt: null,
  });
  const save = () =>
    writeFile(
      path.join(root, 'src/config/assets.manifest.json'),
      JSON.stringify(manifest),
    );
  for (const entry of manifest.entries.filter(
    (item) => item.type === 'BUNDLED' || item.type === 'FIRST_PARTY',
  )) {
    const destination = path.join(root, entry.localPath);
    await mkdir(path.dirname(destination), { recursive: true });
    // Policy fixtures exercise integrity decisions, not SDK execution. Real
    // SDK/model bytes are verified separately by assets:verify and integration.
    const bytes = Buffer.from(`Synthetic policy fixture: ${entry.id}`);
    entry.sha256 = digest(bytes);
    entry.sizeBytes = bytes.length;
    await writeFile(destination, bytes);
    const bundled = path.join(
      root,
      'dist',
      entry.localPath.slice('public/'.length),
    );
    await mkdir(path.dirname(bundled), { recursive: true });
    await writeFile(bundled, bytes);
  }
  await save();
  await writeFile(
    path.join(root, 'docs/NOTICE.md'),
    modelNotice(manifest.entries[0]),
  );
  await writeFile(
    path.join(root, 'public/models/.gitignore'),
    '*.task\n*.part\n*.receipt.json\n*.attempt.json\n',
  );
  await writeFile(path.join(root, 'dist/index.html'), '<!doctype html>');
  git(root, ['init', '--quiet']);
  return { root, manifest, save };
}
const fakeRequest = async (url, options) => {
  assert.equal(url, MODEL_URL);
  assert.equal(options.redirect, 'error');
  return {
    ok: true,
    body: (async function* () {
      yield syntheticBytes;
    })(),
  };
};
const quiet = () => {};
function release(root) {
  return spawnSync(
    process.execPath,
    [path.join(repo, 'scripts/verify-assets.mjs'), '--release'],
    { cwd: root, encoding: 'utf8' },
  );
}

test('manifest schema and required provenance reject malformed values', () => {
  assert.equal(parseManifest(actual).entries[0].licenseStatus, 'UNRESOLVED');
  for (const patch of [
    { schemaVersion: 2 },
    { entries: [] },
    { releaseFiles: ['../escape'] },
  ])
    assert.throws(() => parseManifest({ ...actual, ...patch }));
  for (const patch of [
    { sha256: 'bad' },
    { sizeBytes: 0 },
    { localPath: 'public/../escape' },
    { type: 'UNKNOWN' },
    { fetchedAt: 'invalid' },
    { required: 'true' },
  ]) {
    const copy = globalThis.structuredClone(actual);
    Object.assign(copy.entries[0], patch);
    assert.throws(() => parseManifest(copy));
  }
});
test('fixed official model source rejects latest and alternate origins/versions', () => {
  for (const sourceUrl of [
    MODEL_URL.replace('/1/', '/latest/'),
    MODEL_URL.replace('storage.googleapis.com', 'attacker.invalid'),
  ]) {
    const copy = globalThis.structuredClone(actual);
    copy.entries[0].sourceUrl = sourceUrl;
    assert.throws(() => parseManifest(copy));
  }
});
test('BUNDLED needs license evidence; FIRST_PARTY needs authorship and generation', () => {
  for (const type of ['BUNDLED', 'FIRST_PARTY']) {
    const copy = globalThis.structuredClone(actual);
    copy.entries.push({
      ...copy.entries[0],
      id: 'other',
      localPath: 'public/other.bin',
      type,
    });
    assert.throws(() => parseManifest(copy));
  }
});
test('receipt-backed local fetch is idempotent, verified and still release-blocked', async () => {
  const { root } = await fixture();
  let calls = 0;
  const request = async (...args) => {
    calls++;
    return fakeRequest(...args);
  };
  await fetchAssets(root, { request, log: quiet });
  const original = await readFile(
    path.join(root, 'public/models/gesture_recognizer.task.receipt.json'),
  );
  await fetchAssets(root, { request, log: quiet });
  assert.equal(calls, 1);
  assert.deepEqual(
    await readFile(
      path.join(root, 'public/models/gesture_recognizer.task.receipt.json'),
    ),
    original,
  );
  assert.equal(
    (await verifyAssets(root)).entries[0].licenseStatus,
    'UNRESOLVED',
  );
  assert.equal(
    git(root, ['ls-files', '--', 'public/models/gesture_recognizer.task'])
      .length,
    0,
  );
  await bundleAssets(root);
  assert.deepEqual(
    await listFiles(path.join(root, 'dist')),
    [
      'index.html',
      'release-files.json',
      ...actual.releaseFiles.map((file) => file.slice('public/'.length)),
    ].sort(),
  );
  const result = release(root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED_PENDING_LICENSE/);
});
test('missing local model is a preparation error with fetch instruction', async () => {
  const { root } = await fixture();
  await assert.rejects(
    verifyAssets(root),
    /DEV_PREPARATION_REQUIRED.*assets:fetch/,
  );
});
test('hash mismatch fails and removes temporary download, never finalizes', async () => {
  const { root } = await fixture();
  await assert.rejects(
    fetchAssets(root, {
      log: quiet,
      request: async () => ({
        ok: true,
        body: (async function* () {
          yield Buffer.alloc(syntheticBytes.length);
        })(),
      }),
    }),
    /SHA-256/,
  );
  const files = await readdir(path.join(root, 'public/models'));
  assert.ok(!files.includes('gesture_recognizer.task'));
  assert.ok(!files.some((f) => f.endsWith('.part')));
});
test('interrupted stream fails, cleans partial and can safely retry', async () => {
  const { root } = await fixture();
  await assert.rejects(
    fetchAssets(root, {
      log: quiet,
      request: async () => ({
        ok: true,
        body: (async function* () {
          yield syntheticBytes.subarray(0, 4);
          throw new Error('network interrupted');
        })(),
      }),
    }),
    /network interrupted/,
  );
  assert.ok(
    !(await readdir(path.join(root, 'public/models'))).some(
      (f) => f.endsWith('.part') || f.endsWith('.task'),
    ),
  );
  await fetchAssets(root, { request: fakeRequest, log: quiet });
  await verifyAssets(root);
});
test('existing unknown file is preserved and reported, not overwritten', async () => {
  const { root } = await fixture();
  const target = path.join(root, 'public/models/gesture_recognizer.task');
  await writeFile(target, syntheticBytes);
  await assert.rejects(
    fetchAssets(root, { request: fakeRequest, log: quiet }),
    /UNKNOWN_PROVENANCE/,
  );
  assert.deepEqual(await readFile(target), syntheticBytes);
});
test('corrupt installed file cannot pass development validation', async () => {
  const { root } = await fixture();
  await fetchAssets(root, { request: fakeRequest, log: quiet });
  await writeFile(
    path.join(root, 'public/models/gesture_recognizer.task'),
    Buffer.alloc(syntheticBytes.length),
  );
  await assert.rejects(verifyAssets(root), /SHA-256/);
});
test('forced staging in independent Git fixture rejects release and dev', async () => {
  const { root } = await fixture();
  await fetchAssets(root, { request: fakeRequest, log: quiet });
  git(root, ['add', '-f', '--', 'public/models/gesture_recognizer.task']);
  await assert.rejects(verifyAssets(root), /tracked by Git/);
  const result = release(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tracked by Git/);
});
test('injected model release-list member is rejected', async () => {
  const { root, manifest, save } = await fixture();
  manifest.releaseFiles.push(manifest.entries[0].localPath);
  await save();
  const result = release(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /redistribution forbidden/);
});
test('model in actual dist is rejected even renamed', async () => {
  const { root, manifest } = await fixture();
  await writeFile(path.join(root, 'dist/renamed.bin'), syntheticBytes);
  await assert.rejects(
    auditDistribution(root, manifest),
    /EXTERNAL_LOCAL in release package/,
  );
});

async function generatedWorkerFixture() {
  const f = await fixture();
  await mkdir(path.join(f.root, 'dist/assets'), { recursive: true });
  const worker = 'assets/vision.worker-Dzm655O7.js';
  const main = 'assets/index-C2EfghC2.js';
  const write = (
    file,
    text = '// Synthetic build-policy fixture, no model or SDK',
  ) => writeFile(path.join(f.root, 'dist', file), text);
  await write(worker);
  await write(
    main,
    'const workerUrl = `/assets/vision.worker-Dzm655O7.js`; new Worker(workerUrl);',
  );
  return { ...f, worker, main, write };
}
test('one source-named generated worker with observed eight-character hash and exact main reference passes', async () => {
  const f = await generatedWorkerFixture();
  const files = await auditDistribution(f.root, f.manifest);
  assert.ok(files.includes(f.worker));
  assert.ok(files.includes('models/vision-worker-bootstrap.js'));
  assert.ok(
    !f.manifest.releaseFiles.some((file) => file.includes('vision.worker-')),
  );
});
for (const filename of [
  'assets/other.worker-Dzm655O7.js',
  'assets/vision.worker.js',
  'assets/vision.worker-no-valid-hash.js',
  'assets/vision.worker-Dzm655O7.js.map',
  'assets/random-Dzm655O7.js',
  'models/unregistered.js',
])
  test(`generated-worker policy still rejects ${filename}`, async () => {
    const f = await generatedWorkerFixture();
    await f.write(filename);
    await assert.rejects(
      auditDistribution(f.root, f.manifest),
      /Unregistered release file/,
    );
  });
test('second worker and second disguised main bundle are rejected', async () => {
  const f = await generatedWorkerFixture();
  await f.write('assets/vision.worker-Abc123_-.js');
  await assert.rejects(
    auditDistribution(f.root, f.manifest),
    /Multiple generated vision workers/,
  );
  await rm(path.join(f.root, 'dist/assets/vision.worker-Abc123_-.js'));
  await f.write('assets/index-Abc123_-.js');
  await assert.rejects(
    auditDistribution(f.root, f.manifest),
    /Multiple main entry/,
  );
});
test('unreferenced worker, wrong exact reference and missing generated output fail closed', async () => {
  const f = await generatedWorkerFixture();
  await f.write(f.main);
  await assert.rejects(
    auditDistribution(f.root, f.manifest),
    /exactly referenced/,
  );
  await f.write(
    f.main,
    'const workerUrl = "/assets/vision.worker-Abc123_-.js";',
  );
  await assert.rejects(
    auditDistribution(f.root, f.manifest),
    /exactly referenced/,
  );
  await rm(path.join(f.root, 'dist', f.worker));
  await assert.rejects(
    auditDistribution(f.root, f.manifest),
    /exactly referenced/,
  );
});
test('worker allowance does not admit the model, including renamed model bytes', async () => {
  const f = await generatedWorkerFixture();
  await f.write('models/gesture_recognizer.task', syntheticBytes);
  await assert.rejects(auditDistribution(f.root, f.manifest), /EXTERNAL_LOCAL/);
  await rm(path.join(f.root, 'dist/models/gesture_recognizer.task'));
  await f.write(f.worker, syntheticBytes);
  await assert.rejects(auditDistribution(f.root, f.manifest), /EXTERNAL_LOCAL/);
});
test('unsupported Apache-2.0 relabeling cannot legalize the model', async () => {
  const { root, manifest, save } = await fixture();
  manifest.entries[0].licenseStatus = 'Apache-2.0';
  await save();
  const result = release(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unresolved license policy/);
});
test('NOTICE cannot falsely claim model Apache-2.0', async () => {
  const { root } = await fixture();
  await writeFile(
    path.join(root, 'docs/NOTICE.md'),
    '## MediaPipe Gesture Recognizer model\nLicense: Apache-2.0',
  );
  await assert.rejects(verifyAssets(root, { requireLocal: false }), /NOTICE/);
});

test('release validation cannot skip missing required BUNDLED files', async () => {
  const { root, manifest, save } = await fixture();
  manifest.entries.push({
    ...manifest.entries[0],
    id: 'bundled',
    localPath: 'public/data.bin',
    type: 'BUNDLED',
    licenseStatus: 'VERIFIED',
    licenseId: 'TEST-LICENSE',
    licenseEvidenceUrl: 'https://example.invalid/test-only-license',
    redistributionAllowed: true,
    releaseStatus: 'APPROVED',
  });
  await save();
  await assert.rejects(
    verifyAssets(root, { requireLocal: false }),
    /DEV_PREPARATION_REQUIRED.*data.bin/,
  );
});
test('release audit rejects allowlisted files omitted from actual dist', async () => {
  const { root, manifest } = await fixture();
  manifest.releaseFiles.push('public/missing.bin');
  await assert.rejects(
    auditDistribution(root, manifest),
    /Missing approved release file/,
  );
});
