import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import { createFinalGesturePlan } from './final-gesture-acceptance.mjs';
const base = new URL('../../.gesture-globe/reports/', import.meta.url);
const historical = new URL('TASK-412-manual-plan.json', base);
const before = await readFile(historical);
const plan = {
  ...createFinalGesturePlan(),
  historical412PlanSha256: createHash('sha256').update(before).digest('hex'),
};
await writeFile(
  new URL('TASK-708-manual-plan.json', base),
  JSON.stringify(plan, null, 2) + '\n',
  { flag: 'wx' },
);
const columns = Object.keys(plan.suites[0].rows[0]);
const csv = [
  'suiteId,configVersion,' + columns.join(','),
  ...plan.suites.flatMap((suite) =>
    suite.rows.map((row) =>
      [
        suite.id,
        suite.configVersion,
        ...columns.map((key) => row[key] ?? ''),
      ].join(','),
    ),
  ),
].join('\n');
await writeFile(new URL('TASK-708-manual-matrix.csv', base), csv + '\n', {
  flag: 'wx',
});
if (!(await readFile(historical)).equals(before))
  throw new Error('Historical412 plan changed');
