import type {
  GestureIntent,
  GestureIntentKind,
  IntentPhase,
} from './contracts.ts';
import { isPlainDto } from './dto.ts';

const phases: Readonly<Record<GestureIntentKind, readonly IntentPhase[]>> = {
  NONE: ['END', 'CANCEL'],
  ROTATE: ['START', 'UPDATE', 'END', 'CANCEL'],
  ZOOM: ['START', 'UPDATE', 'END', 'CANCEL'],
  PAUSE: ['START', 'END', 'CANCEL'],
  SELECT: ['START', 'UPDATE', 'END', 'CANCEL'],
  RESET: ['TRIGGER'],
};
const keys = new Set([
  'schemaVersion',
  'id',
  'sessionId',
  'source',
  'sourceHandId',
  'kind',
  'phase',
  'timestampMs',
  'confidence',
  'traceId',
  'delta',
  'pointer',
  'debug',
]);
const text = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0;
const point = (value: unknown, normalized: boolean) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return (
    Object.keys(p).length === 2 &&
    ['x', 'y'].every(
      (key) =>
        typeof p[key] === 'number' &&
        Number.isFinite(p[key]) &&
        (!normalized || (p[key] >= 0 && p[key] <= 1)),
    )
  );
};

/** Consumer compatibility (requirements 19.6): discard unknown optional fields, return owned known data. */
export function parseGestureIntent(value: unknown): GestureIntent {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !isPlainDto(value)
  )
    throw new TypeError('Invalid GestureIntent: plain finite DTO required');
  const known = Object.fromEntries(
    Object.entries(value).filter(([key]) => keys.has(key)),
  );
  assertGestureIntent(known);
  return {
    ...known,
    ...(known.delta ? { delta: { ...known.delta } } : {}),
    ...(known.pointer ? { pointer: { ...known.pointer } } : {}),
    ...(known.debug ? { debug: { ...known.debug } } : {}),
  };
}

/** Exact public wire contract; raw landmarks/private model objects are not allowed. */
export function assertGestureIntent(
  value: unknown,
): asserts value is GestureIntent {
  const fail = (detail: string): never => {
    throw new TypeError(`Invalid GestureIntent: ${detail}`);
  };
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !isPlainDto(value)
  )
    fail('plain finite DTO required');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((key) => !keys.has(key))) fail('unknown field');
  if (v.schemaVersion !== 1) fail('schemaVersion');
  if (v.source !== 'gesture') fail('source');
  for (const key of ['id', 'sessionId', 'sourceHandId'])
    if (!text(v[key])) fail(key);
  if ('traceId' in v && !text(v.traceId)) fail('traceId');
  if (typeof v.timestampMs !== 'number' || v.timestampMs < 0)
    fail('timestampMs');
  if (typeof v.confidence !== 'number' || v.confidence < 0 || v.confidence > 1)
    fail('confidence');
  if (
    typeof v.kind !== 'string' ||
    !Object.hasOwn(phases, v.kind) ||
    !phases[v.kind as GestureIntentKind].includes(v.phase as IntentPhase)
  )
    fail('kind/phase');
  const moving = v.phase === 'START' || v.phase === 'UPDATE';
  const needsDelta = moving && (v.kind === 'ROTATE' || v.kind === 'ZOOM');
  const needsPointer = moving && v.kind === 'SELECT';
  if (needsDelta ? !point(v.delta, false) : 'delta' in v) fail('delta payload');
  if (needsPointer ? !point(v.pointer, true) : 'pointer' in v)
    fail('pointer payload');
  if (needsDelta && v.phase === 'START') {
    const delta = v.delta as { x: number; y: number };
    if (delta.x !== 0 || delta.y !== 0) fail('START must anchor at zero delta');
  }
  if ('debug' in v) {
    const debug = v.debug as Record<string, unknown>;
    if (
      !debug ||
      typeof debug !== 'object' ||
      Array.isArray(debug) ||
      Object.keys(debug).length !== 2 ||
      !text(debug.candidate) ||
      !Number.isSafeInteger(debug.stableFrames) ||
      (debug.stableFrames as number) < 0
    )
      fail('debug');
  }
}
