import process from 'node:process';
import { bundleAssets } from './scripts/bundle-assets.mjs';

export default {
  build: { copyPublicDir: false },
  plugins: [
    {
      name: 'approved-assets-only',
      apply: 'build',
      async closeBundle() {
        await bundleAssets(process.cwd());
      },
    },
  ],
};
