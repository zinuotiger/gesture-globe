import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { createGestureAcceptancePlan } from './gesture-acceptance.mjs';
const plan = createGestureAcceptancePlan();
// Fixed repo-relative destinations, exclusive creation preserves any earlier recorded evidence.
await writeFile(
  new URL(
    '../../.gesture-globe/reports/TASK-412-manual-plan.json',
    import.meta.url,
  ),
  `${JSON.stringify(plan, null, 2)}\n`,
  { flag: 'wx' },
);
const columns = Object.keys(plan.rows[0]);
const csv = [
  columns.join(','),
  ...plan.rows.map((row) => columns.map((key) => row[key] ?? '').join(',')),
].join('\n');
await writeFile(
  new URL(
    '../../.gesture-globe/reports/TASK-412-manual-matrix.csv',
    import.meta.url,
  ),
  `${csv}\n`,
  { flag: 'wx' },
);
