import { test, expect } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
test('every canonical P0 requirement has exactly one trace row and real test/evidence links', async () => {
  const spec = await readFile(
    'docs/Gesture_Globe_实施级需求规格_v3.0.md',
    'utf8',
  );
  const trace = await readFile('docs/requirements-traceability.md', 'utf8');
  const expected = [
    ...spec.matchAll(/^\|[ \t]+([A-Z]+-\d{3})[ \t]+\|[ \t]+P0[ \t]+\|/gm),
  ]
    .map((m) => m[1])
    .sort();
  const actual = [...trace.matchAll(/^\|[ \t]+([A-Z]+-\d{3})[ \t]+\|/gm)]
    .map((m) => m[1])
    .sort();
  expect(actual).toEqual(expected);
  expect(new Set(actual).size).toBe(actual.length);
  for (const [, link] of trace.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (link.startsWith('#')) continue;
    await access(path.resolve('docs', link));
  }
});
