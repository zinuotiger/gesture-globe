import { defaults, type AppConfig } from '../config/index.ts';
import { toolNames, type ToolName } from './ToolRegistry.ts';

// Read only named own data fields. Extra fields are never traversed or serialized.
function own(value: unknown, key: string): unknown {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new TypeError('Context requires plain snapshots');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !('value' in descriptor))
    throw new TypeError('Missing context data field');
  return descriptor.value;
}
function scalar(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new TypeError('Invalid context scalar');
  return value;
}
export interface ContextInput {
  readonly view: unknown;
  readonly selection: unknown;
  readonly availableTools: readonly ToolName[];
}

/** No device/session IDs, runtime objects, diagnostic payloads or camera data. */
export class AgentContextBuilder {
  constructor(private readonly config: Readonly<AppConfig> = defaults) {}
  build(input: ContextInput) {
    const view = own(input, 'view');
    if (own(view, 'schemaVersion') !== 1)
      throw new TypeError('Unknown view schema');
    const target = own(view, 'target');
    const autoRotate = own(view, 'autoRotate');
    const transition = own(view, 'transition');
    if (
      typeof autoRotate !== 'boolean' ||
      !['IDLE', 'RESET', 'FOCUS'].includes(transition as string)
    )
      throw new TypeError('Invalid view state');
    const safeView = Object.freeze({
      schemaVersion: 1 as const,
      azimuth: scalar(
        own(view, 'azimuth'),
        -Number.MAX_VALUE,
        Number.MAX_VALUE,
      ),
      polar: scalar(
        own(view, 'polar'),
        this.config.globe.minPolar,
        this.config.globe.maxPolar,
      ),
      distance: scalar(
        own(view, 'distance'),
        this.config.globe.minDistance,
        this.config.globe.maxDistance,
      ),
      target: Object.freeze({
        x: scalar(own(target, 'x'), 0, 0),
        y: scalar(own(target, 'y'), 0, 0),
        z: scalar(own(target, 'z'), 0, 0),
      }),
      autoRotate,
      transition: transition as 'IDLE' | 'RESET' | 'FOCUS',
    });
    const selection = own(input, 'selection');
    // Location identifiers and city metadata are intentionally omitted.
    const safeSelection =
      selection === null
        ? null
        : Object.freeze({
            latitude: scalar(own(selection, 'latitude'), -90, 90),
            longitude: scalar(own(selection, 'longitude'), -180, 180),
          });
    const available = own(input, 'availableTools');
    if (!Array.isArray(available) || available.length > toolNames.length)
      throw new TypeError('Invalid capabilities');
    const tools: ToolName[] = [];
    for (let index = 0; index < available.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(
        available,
        String(index),
      );
      if (
        !descriptor ||
        !('value' in descriptor) ||
        !toolNames.includes(descriptor.value) ||
        tools.includes(descriptor.value)
      )
        throw new TypeError('Unknown or duplicate capability');
      tools.push(descriptor.value);
    }
    return Object.freeze({
      view: safeView,
      selection: safeSelection,
      capabilities: Object.freeze({
        agent: this.config.features.agent,
        tools: Object.freeze(this.config.features.agent ? tools : []),
      }),
      versions: Object.freeze({ schema: 1, config: this.config.configVersion }),
    });
  }
}
export type AgentContext = ReturnType<AgentContextBuilder['build']>;
