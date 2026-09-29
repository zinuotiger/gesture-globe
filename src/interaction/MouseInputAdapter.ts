import { createInputAdapter } from './adapters.ts';
import type { InputPort } from './input.types.ts';
import type { CommandBus } from './CommandBus.ts';

/** Receives numeric Orbit proposals only; no DOM, camera or raw observations. */
export function createMouseInput(
  port: InputPort & Partial<Pick<CommandBus, 'flush' | 'getState'>>,
  now: () => number,
  namespace: string,
) {
  const adapter = createInputAdapter('mouse', port, now, namespace);
  return Object.freeze({
    settle() {
      port.flush?.();
      return (port.getState?.().pending ?? 0) === 0;
    },
    cancel() {
      adapter.send('ROTATE', 'CANCEL', {});
      adapter.send('ZOOM', 'CANCEL', {});
    },
    start() {
      adapter.send('CANCEL', 'TRIGGER', {});
      adapter.send('SET_AUTOROTATE', 'TRIGGER', { enabled: false });
    },
    move({
      yaw,
      pitch,
      delta,
      dt,
    }: Readonly<{ yaw: number; pitch: number; delta: number; dt: number }>) {
      if (yaw || pitch) adapter.send('ROTATE', 'UPDATE', { yaw, pitch, dt });
      if (delta) adapter.send('ZOOM', 'UPDATE', { delta, dt });
    },
  });
}
