import { visionAssetIntegrity } from '../config/index.ts';
import { VisionAssetError } from './VisionWorkerRuntime.ts';

export type AssetFailure =
  | 'HTTP'
  | 'MIME'
  | 'HTML'
  | 'JSON'
  | 'EMPTY'
  | 'SIZE'
  | 'SHA256'
  | 'SOURCE'
  | 'NETWORK';
type AssetKind = 'MODEL' | 'WASM' | 'SCRIPT';
export interface Integrity {
  sha256: string;
  sizeBytes: number;
}
/** Validates a bounded byte prefix, exact size and digest. Never reports response contents. */
export async function verifyVisionResponse(
  response: Response,
  expected: Integrity,
  kind: AssetKind,
): Promise<Uint8Array<ArrayBuffer>> {
  const fail = (reason: AssetFailure): never => {
    throw new VisionAssetError(
      kind === 'MODEL' ? 'E-VIS-001' : 'E-VIS-002',
      reason,
    );
  };
  if (!response.ok) fail('HTTP');
  const mime =
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ??
    '';
  const reader = response.body?.getReader();
  if (!reader) return fail('EMPTY');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > expected.sizeBytes) {
        await reader.cancel();
        fail('SIZE');
      }
      chunks.push(part.value);
    }
  } catch (error) {
    if (error instanceof VisionAssetError) throw error;
    return fail('NETWORK');
  } finally {
    reader.releaseLock();
  }
  if (!length) return fail('EMPTY');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const prefix = new TextDecoder()
    .decode(bytes.subarray(0, 256))
    .trimStart()
    .toLowerCase();
  if (
    mime === 'text/html' ||
    prefix.startsWith('<!doctype html') ||
    prefix.startsWith('<html')
  )
    return fail('HTML');
  if (
    mime === 'application/json' ||
    prefix.startsWith('{') ||
    prefix.startsWith('[')
  )
    return fail('JSON');
  const allowed =
    kind === 'SCRIPT'
      ? ['application/javascript', 'text/javascript']
      : kind === 'WASM'
        ? ['application/wasm', 'application/octet-stream']
        : // Vite serves unknown .task extensions without Content-Type. An absent
          // MIME still requires exact pinned length and SHA-256; text is rejected.
          ['application/octet-stream', ''];
  if (!allowed.includes(mime)) return fail('MIME');
  if (length !== expected.sizeBytes) return fail('SIZE');
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  if (digest !== expected.sha256) return fail('SHA256');
  return bytes;
}

export async function fetchVisionAsset(url: string, kind: AssetKind) {
  const code = kind === 'MODEL' ? 'E-VIS-001' : 'E-VIS-002';
  let expected: Integrity;
  try {
    expected = visionAssetIntegrity(url);
  } catch {
    throw new VisionAssetError(code, 'SOURCE');
  }
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new VisionAssetError(code, 'NETWORK');
  }
  return verifyVisionResponse(response, expected, kind);
}
