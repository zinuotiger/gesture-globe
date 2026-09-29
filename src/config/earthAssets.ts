import manifestText from './assets.manifest.json?raw';

/** Build-time asset verification is authoritative; runtime reads the same inventory. */
export function earthTextureUrl(): string {
  const manifest = JSON.parse(manifestText) as {
    entries: {
      id: string;
      localPath: string;
      type: string;
      licenseStatus: string;
    }[];
  };
  const entry = manifest.entries.find((asset) => asset.id === 'earth-day');
  if (
    !entry ||
    entry.type !== 'BUNDLED' ||
    entry.licenseStatus !== 'VERIFIED' ||
    !entry.localPath.startsWith('public/textures/')
  )
    throw new Error('Verified earth-day asset is missing');
  return '/' + entry.localPath.slice('public/'.length);
}
