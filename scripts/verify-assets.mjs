import process from 'node:process';
import console from 'node:console';
import { verifyAssets, auditDistribution } from './asset-policy.mjs';

try {
  const manifest = await verifyAssets(process.cwd(), {
    requireLocal: !process.argv.includes('--release'),
  });
  if (process.argv.includes('--release')) {
    await auditDistribution(process.cwd(), manifest);
    if (
      manifest.entries.some(
        (e) => e.releaseStatus === 'BLOCKED_PENDING_LICENSE',
      )
    ) {
      console.error(
        'RELEASE: BLOCKED_PENDING_LICENSE — model excluded; no public redistribution approval. Local development may continue.',
      );
      process.exitCode = 2;
    } else console.log('RELEASE: PASS');
  } else
    console.log(
      'DEV ASSETS: PASS — local integrity only; public model release remains BLOCKED_PENDING_LICENSE',
    );
} catch (error) {
  console.error(`ASSET VALIDATION FAILED: ${error.message}`);
  process.exitCode = 1;
}
