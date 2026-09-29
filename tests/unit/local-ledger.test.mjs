import { test, expect } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { readLocalLedger } from '../../scripts/local-ledger.mjs';

test('public checkout preserves absent ledger; existing private bytes are read unchanged', async () => {
  const parent = path.resolve('node_modules/.cache');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'ledger-portability-'));
  if (!root.startsWith(parent + path.sep))
    throw new Error('Unsafe fixture cleanup');
  try {
    expect(await readLocalLedger(root)).toBeNull();
    await expect(
      access(path.join(root, '.gesture-globe')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await mkdir(path.join(root, '.gesture-globe'));
    const file = path.join(root, '.gesture-globe/state.json');
    const bytes = '{"testFixture":true,"acceptance":"NOT_RUN"}\n';
    await writeFile(file, bytes);
    expect((await readLocalLedger(root)).toString()).toBe(bytes);
    await rm(file);
    await mkdir(file);
    await expect(readLocalLedger(root)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
