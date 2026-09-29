import type { GlobeCommand } from '../shared/index.ts';
import type { AppConfig } from '../config/index.ts';

/** MS-1 public-command wiring; global keyboard arbitration belongs to TASK-506. */
export function controlCommand(
  action: string,
  id: string,
  at: number,
  config: Readonly<AppConfig>,
): GlobeCommand | undefined {
  const common = { schemaVersion: 1 as const, id, at };
  const dt = config.globe.controlStepSeconds;
  const angle = config.globe.controlRotateStep;
  const delta = config.globe.controlZoomStep;
  switch (action) {
    case 'left':
      return { ...common, type: 'ROTATE', yaw: -angle, pitch: 0, dt };
    case 'right':
      return { ...common, type: 'ROTATE', yaw: angle, pitch: 0, dt };
    case 'up':
      return { ...common, type: 'ROTATE', yaw: 0, pitch: -angle, dt };
    case 'down':
      return { ...common, type: 'ROTATE', yaw: 0, pitch: angle, dt };
    case 'in':
      return { ...common, type: 'ZOOM', delta: -delta, dt };
    case 'out':
      return { ...common, type: 'ZOOM', delta, dt };
    case 'reset':
      return { ...common, type: 'RESET_VIEW' };
    case 'cancel':
      return { ...common, type: 'CANCEL_TRANSITION' };
    default:
      return undefined;
  }
}
