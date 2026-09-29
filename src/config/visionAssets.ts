import manifestText from './assets.manifest.json?raw';

interface Asset {
  id: string;
  localPath: string;
  upstreamVersion: string;
  type: string;
  licenseStatus: string;
  sha256: string;
  sizeBytes: number;
}
export function visionAssetIntegrity(url: string) {
  const asset = (JSON.parse(manifestText) as { entries: Asset[] }).entries.find(
    (entry) => '/' + entry.localPath.slice(7) === url,
  );
  if (!asset || !/^[a-f0-9]{64}$/.test(asset.sha256) || asset.sizeBytes <= 0)
    throw new Error('Unregistered vision asset');
  return Object.freeze({ sha256: asset.sha256, sizeBytes: asset.sizeBytes });
}
export function visionAssetUrls(
  entries: readonly Asset[] = (JSON.parse(manifestText) as { entries: Asset[] })
    .entries,
) {
  const model = entries.find((entry) => entry.id === 'gesture-model');
  if (
    !model ||
    model.type !== 'EXTERNAL_LOCAL' ||
    model.licenseStatus !== 'UNRESOLVED'
  )
    throw new Error('Expected separately governed local model');
  const runtime = [
    'vision_wasm_internal.js',
    'vision_wasm_internal.wasm',
    'vision_wasm_nosimd_internal.js',
    'vision_wasm_nosimd_internal.wasm',
  ].map((name) => {
    const asset = entries.find(
      (entry) => entry.id === `vision-sdk-${name.replaceAll('.', '-')}`,
    );
    if (
      !asset ||
      asset.type !== 'BUNDLED' ||
      asset.licenseStatus !== 'VERIFIED'
    )
      throw new Error(`Verified SDK asset missing: ${name}`);
    return asset;
  });
  const sdkVersion = runtime[0]!.upstreamVersion;
  if (
    !/^\d+\.\d+\.\d+$/.test(sdkVersion) ||
    runtime.some(
      (asset) =>
        asset.upstreamVersion !== sdkVersion ||
        !asset.localPath.startsWith(`public/models/mediapipe-${sdkVersion}/`),
    )
  )
    throw new Error('SDK runtime version/path mismatch');
  if (model.localPath !== 'public/models/gesture_recognizer.task')
    throw new Error('Unexpected local model path');
  return Object.freeze({
    sdkVersion,
    modelUrl: '/' + model.localPath.slice(7),
    wasmRoot: `/models/mediapipe-${sdkVersion}`,
  });
}
