import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { createPrivacyAcceptancePlan } from './privacy-acceptance.mjs';
await writeFile(
  new URL(
    '../../.gesture-globe/reports/TASK-706-manual-plan.json',
    import.meta.url,
  ),
  `${JSON.stringify(createPrivacyAcceptancePlan(), null, 2)}\n`,
  { flag: 'wx' },
);
