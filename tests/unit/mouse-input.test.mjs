import { describe, expect, it } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import {
  CommandBus,
  createMouseInput,
  createInputAdapter,
} from '../../src/interaction/index.ts';

describe('mouse command ingress', () => {
  it('routes start and motion through validation, caps and a shared manual lease', () => {
    let time = 100;
    const commands = [];
    const bus = new CommandBus(
      defaults,
      () => time,
      () => ({ distance: 3 }),
      (command, source) => {
        commands.push({ command, source });
        return true;
      },
    );
    const mouse = createMouseInput(bus, () => time, 'unit');
    mouse.start();
    expect(commands.map((x) => x.command.type)).toEqual([
      'CANCEL_TRANSITION',
      'SET_AUTOROTATE',
    ]);
    expect(bus.locks.current(time).owner).toBe('mouse');
    time += 20;
    mouse.move({ yaw: 100, pitch: -100, delta: 100, dt: 0.02 });
    expect(bus.getState().pending).toBe(1);
    time += 17;
    bus.flush();
    expect(commands[2].command).toMatchObject({
      type: 'ROTATE',
      yaw: 0.06,
      pitch: -0.06,
    });
    expect(commands[3].command).toMatchObject({ type: 'ZOOM', delta: 0.024 });
    expect(commands.every((x) => x.source === 'mouse')).toBe(true);
    expect(bus.locks.tryAcquire('gesture', time).accepted).toBe(false);
    mouse.move({ yaw: NaN, pitch: Infinity, delta: Infinity, dt: 0.02 });
    expect(commands).toHaveLength(4);
    bus.dispose();
    expect(commands.slice(-2).map((x) => x.command.type)).toEqual([
      'CANCEL_TRANSITION',
      'SET_AUTOROTATE',
    ]);
    const disposedCount = commands.length;
    mouse.start();
    expect(commands).toHaveLength(disposedCount);
  });
  it('reports execution rejection and exceptions without pretending the camera moved', () => {
    let fail = false;
    const bus = new CommandBus(
      defaults,
      () => 100,
      () => ({ distance: 3 }),
      () => {
        if (fail) throw new Error('executor unavailable');
        return false;
      },
    );
    const mouse = createInputAdapter('mouse', bus, () => 100, 'failure');
    expect(mouse.send('RESET', 'TRIGGER', {})).toEqual({
      accepted: false,
      reason: 'EXECUTION_REJECTED',
    });
    fail = true;
    expect(mouse.send('RESET', 'TRIGGER', {}).reason).toBe('HANDLER_FAILED');
    expect(mouse.send('ZOOM', 'UPDATE', { delta: 1, dt: 0 }).reason).toBe(
      'INVALID_INPUT',
    );
  });
});
