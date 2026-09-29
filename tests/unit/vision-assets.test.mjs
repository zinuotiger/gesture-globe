import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import { visionAssetUrls } from '../../src/config/index.ts';
import { digest, parseManifest } from '../../scripts/asset-policy.mjs';

const manifest = JSON.parse(
  await readFile('src/config/assets.manifest.json', 'utf8'),
);
test('runtime paths are local/versioned and SDK bytes match the existing installed package', async () => {
  assert.deepEqual(visionAssetUrls(), {
    sdkVersion: '0.10.32',
    modelUrl: '/models/gesture_recognizer.task',
    wasmRoot: '/models/mediapipe-0.10.32',
  });
  for (const entry of manifest.entries.filter((e) =>
    e.id.startsWith('vision-sdk-'),
  )) {
    const bytes = await readFile(entry.localPath);
    assert.equal(digest(bytes), entry.sha256);
    assert.equal(bytes.length, entry.sizeBytes);
    assert.equal(entry.licenseId, 'Apache-2.0');
    assert.ok(manifest.releaseFiles.includes(entry.localPath));
    if (entry.kind !== 'data')
      assert.deepEqual(
        bytes,
        await readFile(
          'node_modules/@mediapipe/tasks-vision/wasm/' +
            entry.localPath.split('/').at(-1),
        ),
      );
  }
  const model = manifest.entries.find((e) => e.id === 'gesture-model');
  assert.equal(model.licenseStatus, 'UNRESOLVED');
  assert.ok(!manifest.releaseFiles.includes(model.localPath));
});
test('missing SDK files, mixed versions and unapproved runtime assets fail closed', () => {
  assert.throws(() =>
    visionAssetUrls(
      manifest.entries.filter(
        (e) => e.id !== 'vision-sdk-vision_wasm_internal-js',
      ),
    ),
  );
  for (const change of [
    { upstreamVersion: 'latest' },
    { type: 'EXTERNAL_LOCAL' },
    { localPath: 'https://invalid/runtime.wasm' },
  ]) {
    const entries = globalThis.structuredClone(manifest.entries);
    Object.assign(
      entries.find((e) => e.id === 'vision-sdk-vision_wasm_internal-wasm'),
      change,
    );
    assert.throws(() => visionAssetUrls(entries));
  }
  assert.equal(parseManifest(manifest).schemaVersion, 1);
});
