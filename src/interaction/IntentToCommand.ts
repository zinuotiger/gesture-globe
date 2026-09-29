import { defaults } from '../config/index.ts';
import type { AppConfig } from '../config/index.ts';
import { isGlobeCommand } from '../globe/index.ts';
import type {
  GlobeCommand,
  InputSource,
  Point2,
  ViewState,
  GeoCoordinate,
} from '../shared/index.ts';
import { parseInputIntent } from './inputSchema.ts';
import type { ControlInputIntent } from './input.types.ts';

export type MappedAction =
  | Readonly<{
      type: 'DRAW_ROUTE';
      source: 'agent';
      points: readonly GeoCoordinate[];
    }>
  | Readonly<{ type: 'COMMAND'; command: GlobeCommand }>
  | Readonly<{
      type: 'CONTROL_START' | 'CONTROL_END' | 'CONTROL_CANCEL';
      source: InputSource;
      kind: 'ROTATE' | 'ZOOM';
    }>
  | Readonly<{
      type: 'SELECT_POINTER';
      source: InputSource;
      id: string;
      atMs: number;
      pointer: Point2;
      traceId?: string;
    }>
  | Readonly<{ type: 'SELECT_CANCEL'; source: InputSource }>
  | Readonly<{
      type: 'SELECT_GEO';
      source: 'agent';
      id: string;
      atMs: number;
      lat: number;
      lon: number;
      traceId?: string;
    }>
  | Readonly<{ type: 'PAUSE_GESTURE'; paused: boolean }>;
export type MappingResult =
  | Readonly<{ ok: true; input: ControlInputIntent; action: MappedAction }>
  | Readonly<{
      ok: false;
      reason:
        | 'INVALID_INPUT'
        | 'INVALID_TIME'
        | 'STALE'
        | 'FEATURE_DISABLED'
        | 'INVALID_PAYLOAD'
        | 'INVALID_VIEW';
    }>;
export interface MappingContext {
  readonly nowMs: number;
  readonly view?: Pick<ViewState, 'distance'>;
}
const clamp = (n: number, limit: number) =>
  Math.max(-limit, Math.min(limit, n));

/** Pure mapping; all timestamps must share a monotonic base. No command handler or raw observations. */
export function mapIntent(
  value: unknown,
  context: MappingContext,
  config: Readonly<AppConfig> = defaults,
): MappingResult {
  let input: ControlInputIntent;
  try {
    input = parseInputIntent(value);
  } catch {
    return { ok: false, reason: 'INVALID_INPUT' };
  }
  const reject = (
    reason: Extract<MappingResult, { ok: false }>['reason'],
  ): MappingResult => ({ ok: false, reason });
  const accept = (action: MappedAction): MappingResult => ({
    ok: true,
    input,
    action,
  });
  if (
    !context ||
    !Number.isFinite(context.nowMs) ||
    context.nowMs < 0 ||
    input.timestampMs > context.nowMs
  )
    return reject('INVALID_TIME');
  const maxAge =
    input.source === 'gesture'
      ? config.vision.staleFrameMs
      : config.globe.commandMaxAgeMs;
  if (context.nowMs - input.timestampMs > maxAge) return reject('STALE');
  if (input.source === 'agent' && !config.features.agent)
    return reject('FEATURE_DISABLED');
  const p = input.payload;
  const common = {
    schemaVersion: 1 as const,
    id: `${input.source}:${input.id}`,
    at: input.timestampMs,
    ...(input.traceId ? { traceId: input.traceId } : {}),
  };
  const command = (c: GlobeCommand): MappingResult =>
    isGlobeCommand(c)
      ? accept({ type: 'COMMAND', command: c })
      : reject('INVALID_PAYLOAD');
  const terminal = input.phase === 'END' || input.phase === 'CANCEL';
  if (input.kind === 'ROTATE' || input.kind === 'ZOOM') {
    if (terminal)
      return accept({
        type: input.phase === 'END' ? 'CONTROL_END' : 'CONTROL_CANCEL',
        source: input.source,
        kind: input.kind,
      });
    if (
      typeof p.dt !== 'number' ||
      p.dt < 0 ||
      (input.phase === 'UPDATE' && p.dt === 0)
    )
      return reject('INVALID_PAYLOAD');
    if (
      input.kind === 'ROTATE'
        ? typeof p.yaw !== 'number' || typeof p.pitch !== 'number'
        : typeof p.delta !== 'number'
    )
      return reject('INVALID_PAYLOAD');
    if (input.phase === 'START') {
      if (
        input.kind === 'ROTATE' ? p.yaw !== 0 || p.pitch !== 0 : p.delta !== 0
      )
        return reject('INVALID_PAYLOAD');
      return accept({
        type: 'CONTROL_START',
        source: input.source,
        kind: input.kind,
      });
    }
    const dt = Math.min(p.dt, config.globe.maxCommandDeltaSeconds);
    if (input.kind === 'ROTATE')
      return command({
        ...common,
        type: 'ROTATE',
        yaw: clamp(p.yaw! / p.dt, config.globe.maxAngularSpeed) * dt,
        pitch: clamp(p.pitch! / p.dt, config.globe.maxAngularSpeed) * dt,
        dt,
      });
    let delta = clamp(p.delta! / p.dt, config.zoom.maxSpeed) * dt;
    if (input.source === 'gesture') {
      const distance = context.view?.distance;
      if (
        typeof distance !== 'number' ||
        !Number.isFinite(distance) ||
        distance < config.globe.minDistance ||
        distance > config.globe.maxDistance
      )
        return reject('INVALID_VIEW');
      const logDelta =
        clamp(p.delta! / p.dt, config.zoom.maxSpeed * config.zoom.gain) * dt;
      delta = clamp(distance * Math.expm1(logDelta), config.zoom.maxSpeed * dt);
    }
    return command({ ...common, type: 'ZOOM', delta, dt });
  }
  switch (input.kind) {
    case 'DRAW_ROUTE':
      if (
        input.source !== 'agent' ||
        !p.points ||
        p.points.length < 2 ||
        p.points.length > config.agent.maxRoutePoints
      )
        return reject('INVALID_PAYLOAD');
      return accept({ type: 'DRAW_ROUTE', source: 'agent', points: p.points });
    case 'SELECT_GEO':
      if (
        input.source !== 'agent' ||
        typeof p.lat !== 'number' ||
        Math.abs(p.lat) > 90 ||
        typeof p.lon !== 'number' ||
        Math.abs(p.lon) > 180
      )
        return reject('INVALID_PAYLOAD');
      return accept({
        type: 'SELECT_GEO',
        source: 'agent',
        id: input.id,
        atMs: input.timestampMs,
        lat: p.lat,
        lon: p.lon,
      });
    case 'SELECT':
      if (terminal)
        return accept({ type: 'SELECT_CANCEL', source: input.source });
      if (!p.pointer) return reject('INVALID_PAYLOAD');
      return accept({
        type: 'SELECT_POINTER',
        source: input.source,
        id: input.id,
        atMs: input.timestampMs,
        pointer: { ...p.pointer },
        ...(input.traceId ? { traceId: input.traceId } : {}),
      });
    case 'PAUSE':
      return input.source === 'gesture'
        ? accept({ type: 'PAUSE_GESTURE', paused: input.phase === 'START' })
        : reject('INVALID_PAYLOAD');
    case 'RESET':
      return command({ ...common, type: 'RESET_VIEW' });
    case 'CANCEL':
      return command({ ...common, type: 'CANCEL_TRANSITION' });
    case 'SET_AUTOROTATE':
      return typeof p.enabled === 'boolean'
        ? command({ ...common, type: 'SET_AUTOROTATE', enabled: p.enabled })
        : reject('INVALID_PAYLOAD');
    case 'FOCUS':
      if (
        typeof p.lat !== 'number' ||
        Math.abs(p.lat) > 90 ||
        typeof p.lon !== 'number' ||
        Math.abs(p.lon) > 180 ||
        (p.distance !== undefined &&
          (p.distance < config.globe.minDistance ||
            p.distance > config.globe.maxDistance))
      )
        return reject('INVALID_PAYLOAD');
      return command({
        ...common,
        type: 'FOCUS_GEO',
        lat: p.lat,
        lon: p.lon,
        ...(p.distance !== undefined ? { distance: p.distance } : {}),
      });
  }
}
