import { parseGestureIntent } from '../shared/index.ts';
import type { InputSource } from '../shared/index.ts';
import type {
  ControlInputIntent,
  ControlPayload,
  InputAdapter,
  InputPort,
} from './input.types.ts';
import { parseInputIntent } from './inputSchema.ts';

export function createInputAdapter(
  source: Exclude<InputSource, 'gesture'>,
  port: InputPort,
  now: () => number,
  namespace: string,
): InputAdapter {
  if (
    !['mouse', 'keyboard', 'ui', 'agent'].includes(source) ||
    !namespace.trim()
  )
    throw new TypeError('Invalid adapter identity');
  let sequence = 0;
  return Object.freeze({
    source,
    send(kind, phase, payload, traceId) {
      return port.dispatch({
        schemaVersion: 1,
        id: `${source}-${namespace}-${++sequence}`,
        source,
        kind,
        phase,
        timestampMs: now(),
        payload,
        ...(traceId !== undefined ? { traceId } : {}),
      });
    },
  } satisfies InputAdapter);
}

/** Caller supplies measured dt; no landmark access or model dependency. NONE is inert. */
export function gestureToInput(
  value: unknown,
  dt: number,
): ControlInputIntent | undefined {
  const intent = parseGestureIntent(value);
  if (intent.kind === 'NONE') return undefined;
  const payload: ControlPayload = {
    sessionId: intent.sessionId,
    sourceHandId: intent.sourceHandId,
    confidence: intent.confidence,
  };
  if (intent.phase === 'START' || intent.phase === 'UPDATE') {
    if (intent.kind === 'ROTATE' || intent.kind === 'ZOOM') {
      if (
        !Number.isFinite(dt) ||
        dt < 0 ||
        (intent.phase === 'UPDATE' && dt === 0)
      )
        throw new TypeError('Motion requires measured positive dt');
      payload.dt = dt;
      if (intent.kind === 'ROTATE') {
        payload.yaw = intent.delta!.x;
        payload.pitch = intent.delta!.y;
      } else payload.delta = intent.delta!.y;
    } else if (intent.kind === 'SELECT') {
      if (!intent.pointer) throw new TypeError('SELECT requires pointer');
      payload.pointer = intent.pointer;
    }
  }
  return parseInputIntent({
    schemaVersion: 1,
    id: intent.id,
    source: 'gesture',
    kind: intent.kind,
    phase: intent.phase,
    timestampMs: intent.timestampMs,
    payload,
    ...(intent.traceId !== undefined ? { traceId: intent.traceId } : {}),
  });
}
