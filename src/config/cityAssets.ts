import manifestText from './assets.manifest.json?raw';

export function cityAsset() {
  const manifest = JSON.parse(manifestText) as {
    entries: {
      id: string;
      type: string;
      licenseStatus: string;
      localPath: string;
      sha256: string;
      sizeBytes: number;
    }[];
  };
  const asset = manifest.entries.find(
    (entry) => entry.id === 'cities-natural-earth',
  );
  if (
    !asset ||
    asset.type !== 'BUNDLED' ||
    asset.licenseStatus !== 'VERIFIED' ||
    !asset.localPath.startsWith('public/data/') ||
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    !Number.isSafeInteger(asset.sizeBytes) ||
    asset.sizeBytes <= 0
  )
    throw new Error('Verified city asset missing');
  return Object.freeze({
    url: '/' + asset.localPath.slice(7),
    sha256: asset.sha256,
    sizeBytes: asset.sizeBytes,
  });
}
