import { describe, expect, it } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import {
  shortcutAction,
  createStepInput,
  CommandBus,
} from '../../src/interaction/index.ts';
import {
  CameraRig,
  CommandExecutor,
  TransitionController,
} from '../../src/globe/index.ts';
const key = (value, extra = {}) => ({
  key: value,
  repeat: false,
  isComposing: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  defaultPrevented: false,
  ...extra,
});
describe('keyboard input policy', () => {
  it('recognizes only the specified keys and preserves focus/IME/modifier/consumed events', () => {
    const pairs = [
      ['ArrowLeft', 'left'],
      ['ArrowRight', 'right'],
      ['ArrowUp', 'up'],
      ['ArrowDown', 'down'],
      ['+', 'in'],
      ['-', 'out'],
      ['r', 'reset'],
      ['R', 'reset'],
      ['Escape', 'cancel'],
    ];
    for (const [value, action] of pairs) {
      expect(shortcutAction(key(value), false)).toBe(action);
      expect(shortcutAction(key(value), true)).toBeUndefined();
      for (const flag of [
        'isComposing',
        'altKey',
        'ctrlKey',
        'metaKey',
        'defaultPrevented',
      ])
        expect(
          shortcutAction(key(value, { [flag]: true }), false),
        ).toBeUndefined();
    }
    expect(shortcutAction(key('Enter'), false)).toBeUndefined();
    expect(shortcutAction(key('Tab'), false)).toBeUndefined();
    expect(shortcutAction(key('r', { repeat: true }), false)).toBeUndefined();
    expect(
      shortcutAction(key('Escape', { repeat: true }), false),
    ).toBeUndefined();
    expect(shortcutAction(key('ArrowLeft', { repeat: true }), false)).toBe(
      'left',
    );
  });
  it('keyboard and semantic UI steps traverse the same validated executor and manual lease', () => {
    const rig = new CameraRig(defaults);
    const executor = new CommandExecutor(
      rig,
      defaults,
      new TransitionController(rig, defaults),
    );
    let time = 100;
    const sources = [];
    const interruptions = [];
    const bus = new CommandBus(
      defaults,
      () => time,
      () => executor.getViewState(),
      (command, source) => {
        if (
          command.id.startsWith('interrupt-') ||
          command.id.startsWith('stop-auto-')
        )
          interruptions.push({ source, type: command.type });
        else sources.push(source);
        return executor.execute(command, time);
      },
    );
    for (const source of ['keyboard', 'ui']) {
      const send = createStepInput(source, bus, () => time, 'unit', defaults);
      for (const action of [
        'left',
        'right',
        'up',
        'down',
        'in',
        'out',
        'reset',
        'cancel',
      ]) {
        time += 100;
        expect(send(action).accepted).toBe(true);
        expect(bus.locks.current(time).owner).toBe(source);
      }
      expect(send('unknown')).toBeUndefined();
    }
    expect(sources).toEqual([
      ...Array(8).fill('keyboard'),
      ...Array(8).fill('ui'),
    ]);
    expect(interruptions).toEqual([
      { source: 'keyboard', type: 'CANCEL_TRANSITION' },
      { source: 'keyboard', type: 'SET_AUTOROTATE' },
      { source: 'ui', type: 'CANCEL_TRANSITION' },
      { source: 'ui', type: 'SET_AUTOROTATE' },
    ]);
    expect(executor.getViewState().transition).toBe('IDLE');
    expect(executor.getViewState().autoRotate).toBe(false);
  });
});
