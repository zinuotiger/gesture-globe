import { isPlainDto } from '../shared/index.ts';
import type { ControlInputIntent } from './input.types.ts';
const fields: Record<string, readonly string[]> = {
  ROTATE: ['yaw', 'pitch', 'dt'],
  ZOOM: ['delta', 'dt'],
  SELECT: ['pointer'],
  SELECT_GEO: ['lat', 'lon'],
  DRAW_ROUTE: ['points'],
  PAUSE: [],
  RESET: [],
  FOCUS: ['lat', 'lon', 'distance'],
  SET_AUTOROTATE: ['enabled'],
  CANCEL: [],
};
const phases: Record<string, readonly string[]> = {
  ROTATE: ['START', 'UPDATE', 'END', 'CANCEL'],
  ZOOM: ['START', 'UPDATE', 'END', 'CANCEL'],
  SELECT: ['START', 'UPDATE', 'END', 'CANCEL'],
  SELECT_GEO: ['TRIGGER'],
  DRAW_ROUTE: ['TRIGGER'],
  PAUSE: ['START', 'END', 'CANCEL'],
  RESET: ['TRIGGER'],
  FOCUS: ['TRIGGER'],
  SET_AUTOROTATE: ['TRIGGER'],
  CANCEL: ['TRIGGER'],
};
const nonblank = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
/** Shape normalization only; command ranges, age, source locks and dedup are later pipeline stages. */
export function parseInputIntent(value: unknown): ControlInputIntent {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !isPlainDto(value)
  )
    throw new TypeError('Input must be plain finite data');
  const v = value as Record<string, unknown>;
  if (
    v.schemaVersion !== 1 ||
    !nonblank(v.id) ||
    !['gesture', 'mouse', 'keyboard', 'ui', 'agent'].includes(
      v.source as string,
    ) ||
    typeof v.timestampMs !== 'number' ||
    v.timestampMs < 0 ||
    ('traceId' in v && !nonblank(v.traceId)) ||
    typeof v.kind !== 'string' ||
    !Object.hasOwn(fields, v.kind) ||
    !phases[v.kind]!.includes(v.phase as string)
  )
    throw new TypeError('Invalid input metadata');
  if (!v.payload || typeof v.payload !== 'object' || Array.isArray(v.payload))
    throw new TypeError('Invalid payload');
  const payload = v.payload as Record<string, unknown>;
  const metadata =
    v.source === 'gesture' ? ['sessionId', 'sourceHandId', 'confidence'] : [];
  const terminal = v.phase === 'END' || v.phase === 'CANCEL';
  const allowed = terminal ? metadata : [...fields[v.kind]!, ...metadata];
  if (Object.keys(payload).some((key) => !allowed.includes(key)))
    throw new TypeError('Unknown or terminal payload field');
  for (const key of ['yaw', 'pitch', 'dt', 'delta', 'lat', 'lon', 'distance'])
    if (key in payload && typeof payload[key] !== 'number')
      throw new TypeError('Motion/location scalar must be numeric');
  if ('enabled' in payload && typeof payload.enabled !== 'boolean')
    throw new TypeError('Autorotate flag must be boolean');
  if (
    v.source === 'gesture' &&
    (!nonblank(payload.sessionId) ||
      !nonblank(payload.sourceHandId) ||
      typeof payload.confidence !== 'number' ||
      payload.confidence < 0 ||
      payload.confidence > 1)
  )
    throw new TypeError('Invalid gesture metadata');
  const owned = { ...payload };
  if ('points' in payload) {
    if (
      !Array.isArray(payload.points) ||
      payload.points.some(
        (p) =>
          !p ||
          Object.keys(p).length !== 2 ||
          typeof p.lat !== 'number' ||
          typeof p.lon !== 'number' ||
          Math.abs(p.lat) > 90 ||
          Math.abs(p.lon) > 180,
      )
    )
      throw new TypeError('Invalid route points');
    owned.points = Object.freeze(
      payload.points.map((p) => Object.freeze({ lat: p.lat, lon: p.lon })),
    );
  }
  if ('pointer' in payload) {
    const p = payload.pointer as Record<string, unknown>;
    if (
      !p ||
      typeof p !== 'object' ||
      Array.isArray(p) ||
      Object.keys(p).length !== 2 ||
      !['x', 'y'].every(
        (k) => typeof p[k] === 'number' && p[k] >= 0 && p[k] <= 1,
      )
    )
      throw new TypeError('Invalid pointer');
    owned.pointer = Object.freeze({ x: p.x, y: p.y });
  }
  return Object.freeze({
    schemaVersion: 1,
    id: v.id,
    source: v.source,
    kind: v.kind,
    phase: v.phase,
    timestampMs: v.timestampMs,
    ...(v.traceId !== undefined ? { traceId: v.traceId } : {}),
    payload: Object.freeze(owned),
  }) as ControlInputIntent;
}
