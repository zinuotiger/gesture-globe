import { test, expect } from 'vitest';
import { hashEvidenceFiles } from '../../scripts/release-evidence.mjs';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
test('evidence index hashes actual bytes, deduplicates files and refuses escapes or missing evidence', async () => {
  const parent = path.resolve('node_modules/.cache');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'evidence-index-'));
  if (!root.startsWith(parent + path.sep))
    throw new Error('Unsafe test cleanup');
  try {
    await writeFile(path.join(root, 'record.md'), 'NOT_RUN\n');
    const entries = await hashEvidenceFiles(root, ['record.md', 'record.md']);
    expect(entries).toEqual([
      {
        path: 'record.md',
        sizeBytes: 8,
        sha256: createHash('sha256').update('NOT_RUN\n').digest('hex'),
      },
    ]);
    for (const invalid of ['../package.json', process.cwd(), 'missing.json'])
      await expect(hashEvidenceFiles(root, [invalid])).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
