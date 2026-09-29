import { defaults, type AppConfig } from '../config/index.ts';
import { createInputAdapter, type AgentPort } from '../interaction/index.ts';
import { monotonicNow } from '../shared/index.ts';
import {
  dataRecord,
  parseCoordinates,
  parseToolCall,
  type Coordinates,
  type ToolCall,
  type ToolRegistry,
} from './ToolRegistry.ts';
import { safeExternalText } from './GeocodingAdapter.ts';
import type { JsonClient, ExternalError } from './ExternalJsonClient.ts';

export type WeatherData = Readonly<{
  kind: 'weather';
  temperatureC: number;
  condition: string;
  observedAt: string;
}>;
export type RouteData = Readonly<{
  kind: 'route';
  points: readonly Coordinates[];
  distanceKm: number;
  durationMinutes: number;
  observedAt: string;
}>;
export interface ExternalDataState {
  readonly status: 'IDLE' | 'LOADING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  readonly requestId: number;
  readonly kind: 'weather' | 'route' | null;
  readonly source: string | null;
  readonly fetchedAt: string | null;
  readonly data: WeatherData | RouteData | null;
  readonly error?: ExternalError | 'DISPATCH_REJECTED';
}
const timestamp = (value: unknown, config: Readonly<AppConfig>) => {
  const text = safeExternalText(value, config.agent.maxTextLength);
  if (
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text) ||
    !Number.isFinite(Date.parse(text))
  )
    throw new TypeError('Invalid observed time');
  return text;
};
export function parseWeather(
  value: unknown,
  config: Readonly<AppConfig> = defaults,
): WeatherData {
  const record = dataRecord(value, ['temperatureC', 'condition', 'observedAt']);
  if (
    typeof record.temperatureC !== 'number' ||
    !Number.isFinite(record.temperatureC) ||
    record.temperatureC < config.agent.minTemperatureC ||
    record.temperatureC > config.agent.maxTemperatureC
  )
    throw new TypeError('Invalid temperature');
  return Object.freeze({
    kind: 'weather',
    temperatureC: record.temperatureC,
    condition: safeExternalText(record.condition, config.agent.maxTextLength),
    observedAt: timestamp(record.observedAt, config),
  });
}
export function parseRoute(
  value: unknown,
  config: Readonly<AppConfig> = defaults,
): RouteData {
  const record = dataRecord(value, [
    'points',
    'distanceKm',
    'durationMinutes',
    'observedAt',
  ]);
  if (
    !Array.isArray(record.points) ||
    record.points.length < 2 ||
    record.points.length > config.agent.maxRoutePoints ||
    typeof record.distanceKm !== 'number' ||
    !Number.isFinite(record.distanceKm) ||
    record.distanceKm < 0 ||
    typeof record.durationMinutes !== 'number' ||
    !Number.isFinite(record.durationMinutes) ||
    record.durationMinutes < 0
  )
    throw new TypeError('Invalid route');
  return Object.freeze({
    kind: 'route',
    points: Object.freeze(record.points.map(parseCoordinates)),
    distanceKm: record.distanceKm,
    durationMinutes: record.durationMinutes,
    observedAt: timestamp(record.observedAt, config),
  });
}
export class ExternalDataAdapters {
  private generation = 0;
  private active: AbortController | undefined;
  private state: ExternalDataState = Object.freeze({
    status: 'IDLE',
    requestId: 0,
    kind: null,
    source: null,
    fetchedAt: null,
    data: null,
  });
  constructor(
    private readonly clients: { weather?: JsonClient; route?: JsonClient } = {},
    private readonly config: Readonly<AppConfig> = defaults,
  ) {}
  getState(): ExternalDataState {
    return this.state;
  }
  cancel(): void {
    this.active?.abort();
    this.active = undefined;
    this.state = Object.freeze({
      ...this.state,
      requestId: ++this.generation,
      status: 'CANCELLED',
      data: null,
    });
  }
  async load(
    value: ToolCall,
    signal: AbortSignal,
    draw: (points: readonly Coordinates[]) => boolean,
  ): Promise<ExternalDataState> {
    const call = parseToolCall(value, this.config);
    if (call.name !== 'showWeather' && call.name !== 'drawRoute')
      throw new TypeError('Expected data tool');
    this.cancel();
    const requestId = this.generation,
      kind = call.name === 'showWeather' ? 'weather' : 'route';
    const controller = new AbortController();
    this.active = controller;
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) controller.abort();
    this.state = Object.freeze({
      status: 'LOADING',
      requestId,
      kind,
      source: null,
      fetchedAt: null,
      data: null,
    });
    let metadata: Pick<
      ExternalDataState,
      'requestId' | 'kind' | 'source' | 'fetchedAt'
    > = {
      requestId,
      kind,
      source: null as string | null,
      fetchedAt: null as string | null,
    };
    const cancelled = (): ExternalDataState =>
      Object.freeze({ ...metadata, status: 'CANCELLED', data: null });
    try {
      const client = this.clients[kind];
      let params: Record<string, string>;
      if (call.name === 'drawRoute')
        params = {
          fromLat: String(call.args.from.lat),
          fromLon: String(call.args.from.lon),
          toLat: String(call.args.to.lat),
          toLon: String(call.args.to.lon),
        };
      else if (call.name === 'showWeather')
        params = { lat: String(call.args.lat), lon: String(call.args.lon) };
      else throw new TypeError('Unexpected data tool');
      const reply = client
        ? await client.request(params, controller.signal)
        : {
            ok: false as const,
            error: 'UNCONFIGURED' as const,
            source: null,
            fetchedAt: new Date().toISOString(),
          };
      if (requestId !== this.generation) return cancelled();
      if (controller.signal.aborted) return (this.state = cancelled());
      metadata = {
        requestId,
        kind,
        source: reply.source,
        fetchedAt: reply.fetchedAt,
      };
      if (!reply.ok)
        return (this.state = Object.freeze({
          ...metadata,
          status: 'FAILED',
          data: null,
          error: reply.error,
        }));
      const data =
        kind === 'weather'
          ? parseWeather(reply.data, this.config)
          : parseRoute(reply.data, this.config);
      if (data.kind === 'route' && !draw(data.points))
        return (this.state = Object.freeze({
          ...metadata,
          status: 'FAILED',
          data: null,
          error: 'DISPATCH_REJECTED',
        }));
      return (this.state = Object.freeze({
        ...metadata,
        status: 'SUCCEEDED',
        data,
      }));
    } catch {
      if (requestId !== this.generation) return cancelled();
      return (this.state = Object.freeze({
        ...metadata,
        status: controller.signal.aborted ? 'CANCELLED' : 'FAILED',
        data: null,
        error: controller.signal.aborted ? 'CANCELLED' : 'INVALID_RESPONSE',
      }));
    } finally {
      signal.removeEventListener('abort', abort);
      if (this.active === controller) this.active = undefined;
    }
  }
}
export function registerExternalDataTools(
  registry: ToolRegistry,
  adapter: ExternalDataAdapters,
  port: AgentPort,
  now: () => number = monotonicNow,
): void {
  const input = createInputAdapter('agent', port, now, 'external');
  for (const name of ['showWeather', 'drawRoute'] as const)
    registry.register(name, async (call, signal) => {
      const result = await adapter.load(
        call,
        signal,
        (points) => input.send('DRAW_ROUTE', 'TRIGGER', { points }).accepted,
      );
      return result.status === 'SUCCEEDED'
        ? { status: 'SUCCEEDED', code: 'OK' }
        : result.status === 'CANCELLED'
          ? { status: 'CANCELLED', code: 'CANCELLED' }
          : {
              status: 'FAILED',
              code:
                result.error === 'UNCONFIGURED'
                  ? 'UNAVAILABLE'
                  : 'EXECUTION_FAILED',
            };
    });
}
