import type { AppConfig } from '../config/index.ts';
import { createInputAdapter } from './adapters.ts';
import type { InputPort } from './input.types.ts';

/** Shared semantic steps for keyboard and UI, both through the same arbitration port. */
export function createStepInput(
  source: 'keyboard' | 'ui',
  port: InputPort,
  now: () => number,
  namespace: string,
  config: Readonly<AppConfig>,
) {
  const adapter = createInputAdapter(source, port, now, namespace);
  return (action: string) => {
    const dt = config.globe.controlStepSeconds;
    const angle = config.globe.controlRotateStep;
    const distance = config.globe.controlZoomStep;
    switch (action) {
      case 'left':
        return adapter.send('ROTATE', 'UPDATE', { yaw: -angle, pitch: 0, dt });
      case 'right':
        return adapter.send('ROTATE', 'UPDATE', { yaw: angle, pitch: 0, dt });
      case 'up':
        return adapter.send('ROTATE', 'UPDATE', { yaw: 0, pitch: -angle, dt });
      case 'down':
        return adapter.send('ROTATE', 'UPDATE', { yaw: 0, pitch: angle, dt });
      case 'in':
        return adapter.send('ZOOM', 'UPDATE', { delta: -distance, dt });
      case 'out':
        return adapter.send('ZOOM', 'UPDATE', { delta: distance, dt });
      case 'reset':
        return adapter.send('RESET', 'TRIGGER', {});
      case 'cancel':
        return adapter.send('CANCEL', 'TRIGGER', {});
      default:
        return undefined;
    }
  };
}
