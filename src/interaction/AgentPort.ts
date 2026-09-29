import type { ViewState } from '../shared/index.ts';
import { parseInputIntent } from './inputSchema.ts';
import type { CommandBus, InteractionEvent } from './CommandBus.ts';
import type { InputPort } from './input.types.ts';

export interface AgentPort extends InputPort {
  cancel(): void;
  renewTransition(): boolean;
  readView(): Readonly<ViewState>;
  subscribe(listener: (event: Readonly<InteractionEvent>) => void): () => void;
}
/** Narrow public capability, never exposes bus ownership or rendering internals. */
export function createAgentPort(
  bus: CommandBus,
  view: () => Readonly<ViewState>,
): AgentPort {
  return Object.freeze({
    dispatch(value: unknown) {
      try {
        const input = parseInputIntent(value);
        if (input.source !== 'agent')
          return { accepted: false, reason: 'INVALID_INPUT' as const };
        return bus.dispatch(input);
      } catch {
        return { accepted: false, reason: 'INVALID_INPUT' as const };
      }
    },
    cancel: () => bus.cancelAgent(),
    renewTransition: () => bus.renewAgentTransition(),
    readView: view,
    subscribe: (listener: (event: Readonly<InteractionEvent>) => void) =>
      bus.subscribe(listener),
  });
}
