import { defaults, type AppConfig } from '../config/index.ts';

export const toolNames = Object.freeze([
  'focusLocation',
  'resetView',
  'selectGeo',
  'resolveLocation',
  'drawRoute',
  'showWeather',
] as const);
export type ToolName = (typeof toolNames)[number];
export type Coordinates = Readonly<{ lat: number; lon: number }>;
export type ToolCall =
  | Readonly<{
      name: 'focusLocation' | 'selectGeo' | 'showWeather';
      args: Coordinates;
    }>
  | Readonly<{ name: 'resetView'; args: Readonly<Record<string, never>> }>
  | Readonly<{ name: 'resolveLocation'; args: Readonly<{ query: string }> }>
  | Readonly<{
      name: 'drawRoute';
      args: Readonly<{ from: Coordinates; to: Coordinates }>;
    }>;
export type ToolResult = Readonly<{
  status: 'SUCCEEDED' | 'REJECTED' | 'FAILED' | 'CANCELLED';
  code:
    | 'OK'
    | 'DISABLED'
    | 'INVALID_TOOL'
    | 'UNAVAILABLE'
    | 'EXECUTION_FAILED'
    | 'CANCELLED';
}>;
export type ToolExecutor = (
  call: ToolCall,
  signal: AbortSignal,
) => Promise<ToolResult>;

// Data-only descriptors are safe to expose to callers; executors stay private.
export const toolSchemas = Object.freeze({
  focusLocation: 'coordinates',
  resetView: 'empty',
  selectGeo: 'coordinates',
  resolveLocation: 'query',
  drawRoute: 'endpoints',
  showWeather: 'coordinates',
} as const);

export function dataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error('Expected plain data');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some(
      (key) =>
        !Object.hasOwn(descriptors, key) || !('value' in descriptors[key]!),
    )
  )
    throw new Error('Unexpected fields or accessors');
  return Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value]));
}
export function parseCoordinates(value: unknown): Coordinates {
  const record = dataRecord(value, ['lat', 'lon']);
  if (
    typeof record.lat !== 'number' ||
    typeof record.lon !== 'number' ||
    !Number.isFinite(record.lat) ||
    !Number.isFinite(record.lon) ||
    Math.abs(record.lat) > 90 ||
    Math.abs(record.lon) > 180
  )
    throw new Error('Invalid coordinates');
  return Object.freeze({ lat: record.lat, lon: record.lon });
}
export function parseToolCall(
  value: unknown,
  config: Readonly<AppConfig> = defaults,
): ToolCall {
  const { name, args } = dataRecord(value, ['name', 'args']);
  switch (name) {
    case 'focusLocation':
    case 'selectGeo':
    case 'showWeather':
      return Object.freeze({ name, args: parseCoordinates(args) });
    case 'resetView':
      dataRecord(args, []);
      return Object.freeze({ name, args: Object.freeze({}) });
    case 'resolveLocation': {
      const { query } = dataRecord(args, ['query']);
      if (
        typeof query !== 'string' ||
        !query.trim() ||
        query.length > config.agent.maxTextLength
      )
        throw new Error('Invalid query length');
      return Object.freeze({
        name,
        args: Object.freeze({ query: query.trim() }),
      });
    }
    case 'drawRoute': {
      const route = dataRecord(args, ['from', 'to']);
      return Object.freeze({
        name,
        args: Object.freeze({
          from: parseCoordinates(route.from),
          to: parseCoordinates(route.to),
        }),
      });
    }
    default:
      throw new Error('Unknown tool');
  }
}

export class ToolRegistry {
  private readonly executors = new Map<ToolName, ToolExecutor>();
  constructor(private readonly config: Readonly<AppConfig> = defaults) {}
  register(name: ToolName, executor: ToolExecutor): void {
    if (
      !toolNames.includes(name) ||
      this.executors.has(name) ||
      typeof executor !== 'function'
    )
      throw new Error('Invalid or duplicate tool registration');
    this.executors.set(name, executor);
  }
  available(): readonly ToolName[] {
    return Object.freeze(
      this.config.features.agent ? [...this.executors.keys()] : [],
    );
  }
  async execute(
    value: unknown,
    signal = new AbortController().signal,
  ): Promise<ToolResult> {
    if (!this.config.features.agent)
      return { status: 'REJECTED', code: 'DISABLED' };
    let call: ToolCall;
    try {
      call = parseToolCall(value, this.config);
    } catch {
      return { status: 'REJECTED', code: 'INVALID_TOOL' };
    }
    if (signal.aborted) return { status: 'CANCELLED', code: 'CANCELLED' };
    const executor = this.executors.get(call.name);
    if (!executor) return { status: 'REJECTED', code: 'UNAVAILABLE' };
    try {
      const result = await executor(call, signal);
      return signal.aborted
        ? { status: 'CANCELLED', code: 'CANCELLED' }
        : result;
    } catch {
      return signal.aborted
        ? { status: 'CANCELLED', code: 'CANCELLED' }
        : { status: 'FAILED', code: 'EXECUTION_FAILED' };
    }
  }
}
