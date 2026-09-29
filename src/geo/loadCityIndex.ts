import { cityAsset, type AppConfig } from '../config/index.ts';
import { CityIndex, parseCityRecords } from './CityIndex.ts';

export async function loadCityIndex(
  config: Readonly<AppConfig>,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
) {
  const asset = cityAsset();
  const response = await request(asset.url, signal ? { signal } : {});
  if (!response.ok || !response.body)
    throw new Error('E-GEO-001: city data unavailable');
  const reader = response.body.getReader(),
    bytes = new Uint8Array(asset.sizeBytes);
  let offset = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (offset + part.value.length > bytes.length) {
        await reader.cancel();
        throw new Error('E-GEO-001: city size mismatch');
      }
      bytes.set(part.value, offset);
      offset += part.value.length;
    }
  } finally {
    reader.releaseLock();
  }
  if (signal?.aborted)
    throw new DOMException('City request aborted', 'AbortError');
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  if (signal?.aborted)
    throw new DOMException('City request aborted', 'AbortError');
  if (offset !== asset.sizeBytes || hash !== asset.sha256)
    throw new Error('E-GEO-001: city integrity mismatch');
  return new CityIndex(
    parseCityRecords(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    ),
    config.geo.cityThresholdKm,
  );
}
