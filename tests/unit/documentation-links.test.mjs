import { test, expect } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
test('delivery entry documents link to real repository files and only advertise existing npm scripts', async () => {
  const root = process.cwd();
  const pkg = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  for (const file of [
    'README.md',
    'architecture.md',
    'tuning.md',
    'known-limitations.md',
  ]) {
    const full = path.join(root, 'docs', file);
    const text = await readFile(full, 'utf8');
    for (const [, target] of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(target)) continue;
      const resolved = path.resolve(path.dirname(full), target.split('#')[0]);
      expect(resolved.startsWith(root + path.sep)).toBe(true);
      await access(resolved);
    }
    for (const [, script] of text.matchAll(/npm run ([\w:-]+)/g))
      expect(Object.hasOwn(pkg.scripts, script)).toBe(true);
  }
});
