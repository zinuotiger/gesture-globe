import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { URL } from 'node:url';

export const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
export const MODEL_CARD =
  'https://storage.googleapis.com/mediapipe-assets/gesture_recognizer/model_card_hand_gesture_classification_with_faireness_2022.pdf';
export const LICENSE_EVIDENCE =
  '当前资料证明了官方来源和预期使用方式，但没有被本项目解释为模型二进制的明确再分发许可。';
export const MANIFEST_PATH = 'src/config/assets.manifest.json';
export const digest = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
const fail = (message) => {
  throw new Error(message);
};
const nonempty = (value) =>
  typeof value === 'string' && value.trim().length > 0;
export function safePath(root, relative) {
  if (
    !nonempty(relative) ||
    relative.includes('\\') ||
    relative.split('/').some((s) => !s || s === '.' || s === '..') ||
    path.isAbsolute(relative) ||
    relative.includes(':')
  )
    fail(`Unsafe asset path: ${relative}`);
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep))
    fail(`Outside root: ${relative}`);
  return resolved;
}
export function parseManifest(value) {
  if (
    value?.schemaVersion !== 1 ||
    !nonempty(value.assetsVersion) ||
    !Array.isArray(value.entries) ||
    !value.entries.length ||
    !Array.isArray(value.releaseFiles)
  )
    fail('Invalid asset manifest schema');
  const ids = new Set();
  const paths = new Set();
  for (const entry of value.entries) {
    for (const key of [
      'id',
      'displayName',
      'upstream',
      'sourceUrl',
      'upstreamVersion',
      'localPath',
      'licenseStatus',
      'licenseEvidence',
      'releaseStatus',
      'notes',
    ])
      if (!nonempty(entry[key])) fail(`${entry.id}: missing ${key}`);
    if (ids.has(entry.id) || paths.has(entry.localPath))
      fail('Duplicate asset identity/path');
    ids.add(entry.id);
    paths.add(entry.localPath);
    safePath('.', entry.localPath);
    if (!entry.localPath.startsWith('public/'))
      fail(`${entry.id}: asset must be under public`);
    if (
      !['BUNDLED', 'EXTERNAL_LOCAL', 'FIRST_PARTY'].includes(entry.type) ||
      !['model', 'wasm', 'script', 'texture', 'data', 'font'].includes(
        entry.kind,
      )
    )
      fail(`${entry.id}: invalid classification`);
    if (
      typeof entry.required !== 'boolean' ||
      typeof entry.committed !== 'boolean' ||
      typeof entry.redistributionAllowed !== 'boolean'
    )
      fail(`${entry.id}: invalid flags`);
    if (
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.sizeBytes) ||
      entry.sizeBytes <= 0
    )
      fail(`${entry.id}: invalid hash/size`);
    if (
      entry.fetchedAt !== null &&
      (!nonempty(entry.fetchedAt) ||
        !Number.isFinite(Date.parse(entry.fetchedAt)))
    )
      fail(`${entry.id}: invalid fetchedAt`);
    if (/latest/i.test(entry.sourceUrl + entry.upstreamVersion))
      fail(`${entry.id}: latest forbidden`);
    if (
      entry.type !== 'FIRST_PARTY' &&
      new URL(entry.sourceUrl).protocol !== 'https:'
    )
      fail(`${entry.id}: HTTPS required`);
    if (
      entry.type === 'EXTERNAL_LOCAL' &&
      (entry.committed ||
        entry.redistributionAllowed ||
        value.releaseFiles.includes(entry.localPath))
    )
      fail(`${entry.id}: EXTERNAL_LOCAL redistribution forbidden`);
    if (
      entry.type === 'BUNDLED' &&
      (entry.licenseStatus !== 'VERIFIED' ||
        !nonempty(entry.licenseId) ||
        !entry.redistributionAllowed ||
        !nonempty(entry.licenseEvidenceUrl))
    )
      fail(`${entry.id}: bundled license missing`);
    if (
      entry.type === 'FIRST_PARTY' &&
      (!nonempty(entry.author) ||
        !nonempty(entry.generationMethod) ||
        entry.licenseStatus !== 'OWNED' ||
        !entry.redistributionAllowed)
    )
      fail(`${entry.id}: first-party provenance missing`);
  }
  const model = value.entries.find((e) => e.id === 'gesture-model');
  if (
    !model ||
    model.type !== 'EXTERNAL_LOCAL' ||
    model.sourceUrl !== MODEL_URL ||
    model.modelCardUrl !== MODEL_CARD ||
    model.upstreamVersion !== 'gesture_recognizer/float16/1' ||
    model.localPath !== 'public/models/gesture_recognizer.task' ||
    model.licenseStatus !== 'UNRESOLVED' ||
    model.licenseEvidence !== LICENSE_EVIDENCE ||
    model.releaseStatus !== 'BLOCKED_PENDING_LICENSE' ||
    model.licenseId !== undefined
  )
    fail(
      'gesture-model: unresolved license policy cannot be relabeled without reviewed evidence and policy change',
    );
  if (new Set(value.releaseFiles).size !== value.releaseFiles.length)
    fail('Duplicate release file');
  for (const file of value.releaseFiles) {
    safePath('.', file);
    if (
      !value.entries.some(
        (e) =>
          e.localPath === file &&
          e.type !== 'EXTERNAL_LOCAL' &&
          e.redistributionAllowed,
      )
    )
      fail(`Unapproved release file: ${file}`);
  }
  for (const entry of value.entries)
    if (entry.fallbackId) {
      const chain = new Set([entry.id]);
      let next = entry;
      while (next.fallbackId) {
        next = value.entries.find((e) => e.id === next.fallbackId);
        if (!next || next.kind !== entry.kind || chain.has(next.id))
          fail(`${entry.id}: invalid fallback chain`);
        chain.add(next.id);
      }
    }
  return value;
}
export async function readManifest(root) {
  const bytes = await readFile(safePath(root, MANIFEST_PATH));
  return parseManifest(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
}
export function modelNotice(entry) {
  return `## MediaPipe Gesture Recognizer model\n\nSource: ${entry.sourceUrl}\nVersion: ${entry.upstreamVersion}\nSHA-256: ${entry.sha256}\nModel card: ${entry.modelCardUrl}\n\nLicense status: UNRESOLVED. 本项目不主张该模型采用 Apache-2.0。\n${LICENSE_EVIDENCE}\n\nEXTERNAL_LOCAL; redistributionAllowed=false; committed=false; releaseStatus=BLOCKED_PENDING_LICENSE.\n本项目不随源代码或发布包再分发该模型。开发者通过 npm run assets:fetch 从官方上游单独下载用于本地开发与测试。获得明确再分发依据前，公开发布门禁保持阻塞。SDK 许可证不覆盖本项目对模型权重的许可判断。\n`;
}
export function trackedFiles(root) {
  return new TextDecoder('utf-8', { fatal: true })
    .decode(
      execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], {
        cwd: root,
      }),
    )
    .split('\0')
    .filter(Boolean);
}
export async function readAsset(root, entry) {
  const file = safePath(root, entry.localPath);
  if (
    (await lstat(file)).isSymbolicLink() ||
    !(await realpath(file)).startsWith((await realpath(root)) + path.sep)
  )
    fail(`${entry.id}: symlink/outside-root asset forbidden`);
  const bytes = await readFile(file);
  if (bytes.length !== entry.sizeBytes || digest(bytes) !== entry.sha256)
    fail(`${entry.id}: SHA-256/size mismatch`);
  return bytes;
}
export async function verifyAssets(root, { requireLocal = true } = {}) {
  const manifest = await readManifest(root);
  const tracked = trackedFiles(root);
  const notice = await readFile(safePath(root, 'docs/NOTICE.md'), 'utf8');
  const expectedNotice = modelNotice(
    manifest.entries.find((e) => e.id === 'gesture-model'),
  );
  if (
    notice
      .slice(notice.indexOf('## MediaPipe Gesture Recognizer model'))
      .replaceAll('\r\n', '\n')
      .trim() !== expectedNotice.trim()
  )
    fail('Model NOTICE disagrees with unresolved license policy');
  for (const entry of manifest.entries) {
    if (entry.type === 'EXTERNAL_LOCAL' && tracked.includes(entry.localPath))
      fail(`EXTERNAL_LOCAL tracked by Git: ${entry.localPath}`);
    try {
      await readAsset(root, entry);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if ((requireLocal || entry.type !== 'EXTERNAL_LOCAL') && entry.required)
        fail(
          `DEV_PREPARATION_REQUIRED: ${entry.localPath}; run npm run assets:fetch (license remains ${entry.licenseStatus})`,
        );
    }
  }
  return manifest;
}
export async function listFiles(root, directory = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, directory), {
    withFileTypes: true,
  })) {
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail(`Release symlink forbidden: ${relative}`);
    if (entry.isDirectory()) files.push(...(await listFiles(root, relative)));
    else files.push(relative);
  }
  return files.sort();
}
export async function auditDistribution(root, manifest) {
  const dist = safePath(root, 'dist');
  const files = await listFiles(dist);
  for (const file of files)
    if (path.posix.normalize(file) !== file || file.includes('\\'))
      fail(`Non-normalized release path: ${file}`);
  // REC-508: observed pinned Vite output uses one source-named worker and an
  // eight-character URL-safe hash. Unknown chunks remain rejected below.
  const workerPattern = /^assets\/vision\.worker-[A-Za-z0-9_-]{8}\.js$/;
  const workers = files.filter((file) => workerPattern.test(file));
  const mains = files.filter((file) => /^assets\/index-[\w-]+\.js$/.test(file));
  if (mains.length > 1) fail('Multiple main entry bundles are forbidden');
  if (workers.length > 1)
    fail('Multiple generated vision workers are forbidden');
  const mainCode = mains.length
    ? await readFile(safePath(dist, mains[0]), 'utf8')
    : '';
  const references = new Set(
    [
      ...mainCode.matchAll(
        /(['"`])(\/assets\/vision\.worker-[A-Za-z0-9_-]{8}\.js)\1/g,
      ),
    ].map((match) => match[2].slice(1)),
  );
  if (workers.length || references.size) {
    if (
      workers.length !== 1 ||
      mains.length !== 1 ||
      references.size !== 1 ||
      !references.has(workers[0])
    )
      fail(
        'Generated vision worker must be unique and exactly referenced by the main entry',
      );
  }
  for (const file of manifest.releaseFiles) {
    if (!files.includes(file.slice('public/'.length)))
      fail(`Missing approved release file: ${file}`);
  }
  const external = manifest.entries.filter((e) => e.type === 'EXTERNAL_LOCAL');
  for (const file of files) {
    const bytes = await readFile(safePath(dist, file));
    if (
      file.endsWith('.task') ||
      external.some(
        (e) =>
          file === e.localPath.slice('public/'.length) ||
          digest(bytes) === e.sha256,
      )
    )
      fail(`EXTERNAL_LOCAL in release package: ${file}`);
    if (
      !['index.html', 'release-files.json'].includes(file) &&
      !/^assets\/index-[\w-]+\.(js|css)$/.test(file) &&
      !workers.includes(file) &&
      !manifest.releaseFiles.some((p) => p.slice(7) === file)
    )
      fail(`Unregistered release file: ${file}`);
  }
  return files;
}
