import { createInputAdapter, type AgentPort } from '../interaction/index.ts';
import type { ToolRegistry, ToolExecutor } from './ToolRegistry.ts';
import { monotonicNow } from '../shared/index.ts';

/** Tool data has already passed the registry schema. M06 remains the only sink. */
export function registerViewTools(
  registry: ToolRegistry,
  port: AgentPort,
  now: () => number = monotonicNow,
): void {
  const input = createInputAdapter('agent', port, now, 'tools');
  const execute: ToolExecutor = async (call, signal) => {
    if (signal.aborted) return { status: 'CANCELLED', code: 'CANCELLED' };
    const result =
      call.name === 'resetView'
        ? input.send('RESET', 'TRIGGER', {})
        : call.name === 'focusLocation'
          ? input.send('FOCUS', 'TRIGGER', call.args)
          : call.name === 'selectGeo'
            ? input.send('SELECT_GEO', 'TRIGGER', call.args)
            : undefined;
    return result?.accepted
      ? { status: 'SUCCEEDED', code: 'OK' }
      : { status: 'REJECTED', code: 'EXECUTION_FAILED' };
  };
  for (const name of ['focusLocation', 'resetView', 'selectGeo'] as const)
    registry.register(name, execute);
}
