import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import { createJointAcceptancePlan } from './joint-acceptance.mjs';
const base = new URL('../../.gesture-globe/reports/', import.meta.url);
const history = ['TASK-412-manual-plan.json', 'TASK-708-manual-plan.json'];
const saved = await Promise.all(
  history.map((name) => readFile(new URL(name, base))),
);
const plan = {
  ...createJointAcceptancePlan(),
  historicalPlans: history.map((name, i) => ({
    path: name,
    sha256: createHash('sha256').update(saved[i]).digest('hex'),
  })),
};
await writeFile(
  new URL('TASK-806-joint-manual-plan.json', base),
  JSON.stringify(plan, null, 2) + '\n',
  { flag: 'wx' },
);
const columns = Object.keys(plan.gestures.suites[0].rows[0]);
const csv = [
  'suiteId,configVersion,configSha256,' + columns.join(','),
  ...plan.gestures.suites.flatMap((suite) =>
    suite.rows.map((row) =>
      [
        suite.id,
        plan.configVersion,
        plan.configSha256,
        ...columns.map((key) => row[key] ?? ''),
      ].join(','),
    ),
  ),
].join('\n');
await writeFile(new URL('TASK-806-joint-manual-matrix.csv', base), csv + '\n', {
  flag: 'wx',
});
for (let i = 0; i < history.length; i++)
  if (!(await readFile(new URL(history[i], base))).equals(saved[i]))
    throw new Error('Historical plan changed');
