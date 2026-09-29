import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyAssets, safePath, auditDistribution } from './asset-policy.mjs';

export async function bundleAssets(root) {
  const manifest = await verifyAssets(root);
  for (const file of manifest.releaseFiles) {
    const output = safePath(root, `dist/${file.slice('public/'.length)}`);
    await mkdir(path.dirname(output), { recursive: true });
    await copyFile(safePath(root, file), output);
  }
  const files = await auditDistribution(root, manifest);
  await writeFile(
    safePath(root, 'dist/release-files.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        releaseStatus: 'BLOCKED_PENDING_LICENSE',
        files,
        excluded: manifest.entries
          .filter((e) => e.type === 'EXTERNAL_LOCAL')
          .map((e) => e.id),
      },
      null,
      2,
    ) + '\n',
  );
}
