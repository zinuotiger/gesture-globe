import { defaults, type AppConfig } from '../config/index.ts';
import {
  dataRecord,
  parseCoordinates,
  parseToolCall,
  type Coordinates,
  type ToolRegistry,
} from './ToolRegistry.ts';
import type { JsonClient, ExternalError } from './ExternalJsonClient.ts';

export type PlaceCandidate = Coordinates &
  Readonly<{ id: string; label: string }>;
export interface GeocodingState {
  readonly status:
    | 'IDLE'
    | 'LOADING'
    | 'AWAITING_CONFIRMATION'
    | 'EMPTY'
    | 'FAILED'
    | 'CANCELLED'
    | 'CONFIRMED';
  readonly requestId: number;
  readonly candidates: readonly PlaceCandidate[];
  readonly source: string | null;
  readonly fetchedAt: string | null;
  readonly error?: ExternalError;
}
export function safeExternalText(value: unknown, limit: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > limit ||
    /[<>]/u.test(value) ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new TypeError('Invalid external text');
  return value.trim();
}
export class GeocodingAdapter {
  private generation = 0;
  private active: AbortController | undefined;
  private state: GeocodingState = Object.freeze({
    status: 'IDLE',
    requestId: 0,
    candidates: Object.freeze([]),
    source: null,
    fetchedAt: null,
  });
  constructor(
    private readonly client?: JsonClient,
    private readonly config: Readonly<AppConfig> = defaults,
  ) {}
  getState(): GeocodingState {
    return this.state;
  }
  cancel(): void {
    this.active?.abort();
    this.active = undefined;
    this.state = Object.freeze({
      status: 'CANCELLED',
      requestId: ++this.generation,
      candidates: Object.freeze([]),
      source: null,
      fetchedAt: null,
    });
  }
  async search(query: string, signal: AbortSignal): Promise<GeocodingState> {
    const call = parseToolCall(
      { name: 'resolveLocation', args: { query } },
      this.config,
    );
    if (call.name !== 'resolveLocation')
      throw new TypeError('Expected location query');
    this.cancel();
    const requestId = this.generation;
    let metadata: Pick<GeocodingState, 'requestId' | 'source' | 'fetchedAt'> = {
      requestId,
      source: null,
      fetchedAt: null,
    };
    const cancelled = (): GeocodingState =>
      Object.freeze({
        ...metadata,
        status: 'CANCELLED',
        candidates: Object.freeze([]),
      });
    const request = new AbortController();
    this.active = request;
    const abort = () => request.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) request.abort();
    this.state = Object.freeze({
      status: 'LOADING',
      requestId,
      candidates: Object.freeze([]),
      source: null,
      fetchedAt: null,
    });
    try {
      const reply = this.client
        ? await this.client.request({ q: call.args.query }, request.signal)
        : {
            ok: false as const,
            error: 'UNCONFIGURED' as const,
            source: null,
            fetchedAt: new Date().toISOString(),
          };
      if (requestId !== this.generation) return cancelled();
      if (request.signal.aborted) {
        this.cancel();
        return this.state;
      }
      metadata = {
        requestId,
        source: reply.source,
        fetchedAt: reply.fetchedAt,
      };
      if (!reply.ok)
        return (this.state = Object.freeze({
          ...metadata,
          status: 'FAILED',
          error: reply.error,
          candidates: Object.freeze([]),
        }));
      const { candidates } = dataRecord(reply.data, ['candidates']);
      if (
        !Array.isArray(candidates) ||
        candidates.length > this.config.agent.maxCandidates
      )
        throw new TypeError('Too many candidates');
      const ids = new Set<string>();
      const safe = candidates.map((value) => {
        const entry = dataRecord(value, ['id', 'label', 'lat', 'lon']);
        const id = safeExternalText(entry.id, this.config.agent.maxTextLength);
        if (ids.has(id)) throw new TypeError('Duplicate candidate');
        ids.add(id);
        return Object.freeze({
          id,
          label: safeExternalText(entry.label, this.config.agent.maxTextLength),
          ...parseCoordinates({ lat: entry.lat, lon: entry.lon }),
        });
      });
      return (this.state = Object.freeze({
        ...metadata,
        status: safe.length ? 'AWAITING_CONFIRMATION' : 'EMPTY',
        candidates: Object.freeze(safe),
      }));
    } catch {
      if (requestId !== this.generation) return cancelled();
      if (requestId === this.generation)
        this.state = Object.freeze({
          status: request.signal.aborted ? 'CANCELLED' : 'FAILED',
          ...metadata,
          candidates: Object.freeze([]),
          error: request.signal.aborted ? 'CANCELLED' : 'INVALID_RESPONSE',
        });
      return this.state;
    } finally {
      signal.removeEventListener('abort', abort);
      if (this.active === request) this.active = undefined;
    }
  }
  confirm(requestId: number, id: string): Coordinates | undefined {
    if (
      this.state.status !== 'AWAITING_CONFIRMATION' ||
      requestId !== this.state.requestId
    )
      return undefined;
    const place = this.state.candidates.find(
      (candidate) => candidate.id === id,
    );
    if (!place) return undefined;
    this.state = Object.freeze({
      ...this.state,
      status: 'CONFIRMED',
      candidates: Object.freeze([]),
    });
    return Object.freeze({ lat: place.lat, lon: place.lon });
  }
}
export function registerGeocodingTool(
  registry: ToolRegistry,
  adapter: GeocodingAdapter,
): void {
  registry.register('resolveLocation', async (call, signal) => {
    if (call.name !== 'resolveLocation')
      return { status: 'REJECTED', code: 'INVALID_TOOL' };
    const state = await adapter.search(call.args.query, signal);
    return state.status === 'CANCELLED'
      ? { status: 'CANCELLED', code: 'CANCELLED' }
      : state.status === 'FAILED'
        ? {
            status: 'FAILED',
            code:
              state.error === 'UNCONFIGURED'
                ? 'UNAVAILABLE'
                : 'EXECUTION_FAILED',
          }
        : { status: 'SUCCEEDED', code: 'OK' };
  });
}
