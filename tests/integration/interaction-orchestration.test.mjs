import { describe, expect, it } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import {
  CommandBus,
  createInputAdapter,
  createMouseInput,
} from '../../src/interaction/index.ts';
import {
  CameraRig,
  CommandExecutor,
  TransitionController,
} from '../../src/globe/index.ts';

function fixture(hooks = {}) {
  const config = globalThis.structuredClone(defaults);
  config.features.agent = true; // Contract-only harness; product flag stays false.
  const rig = new CameraRig(config);
  const executor = new CommandExecutor(
    rig,
    config,
    new TransitionController(rig, config),
  );
  let time = 100;
  const commands = [],
    events = [],
    cancellations = [],
    selections = [];
  let throwNext = false;
  const bus = new CommandBus(
    config,
    () => time,
    () => executor.getViewState(),
    (command, source) => {
      commands.push({ command, source });
      if (throwNext) {
        throwNext = false;
        throw new Error('injected sink fault');
      }
      return executor.execute(command, time);
    },
    {
      onEvent: (event) => events.push(event),
      onCancel: (source, reason) => cancellations.push({ source, reason }),
      onSelection: (action) => {
        selections.push(action);
        return true;
      },
      ...hooks,
    },
  );
  const input = (source, kind, phase, payload, id, traceId) => ({
    schemaVersion: 1,
    id,
    source,
    kind,
    phase,
    payload: {
      ...(source === 'gesture'
        ? { sessionId: 'session', sourceHandId: 'hand', confidence: 1 }
        : {}),
      ...payload,
    },
    timestampMs: time,
    ...(traceId ? { traceId } : {}),
  });
  const adapters = new Map();
  return {
    bus,
    rig,
    executor,
    commands,
    events,
    cancellations,
    selections,
    input,
    set: (value) => {
      time = value;
    },
    fail: () => {
      throwNext = true;
    },
    adapter: (source) => {
      if (!adapters.has(source))
        adapters.set(
          source,
          createInputAdapter(source, bus, () => time, 'test'),
        );
      return adapters.get(source);
    },
    mouse: createMouseInput(bus, () => time, 'mouse'),
  };
}
describe('interaction orchestration', () => {
  it('a real gesture input stops explicit autorotation after its configuration completes', () => {
    const f = fixture();
    expect(
      f.adapter('ui').send('SET_AUTOROTATE', 'TRIGGER', { enabled: true })
        .accepted,
    ).toBe(true);
    f.set(100 + defaults.interaction.mouseLockMs + 1);
    f.bus.flush();
    expect(f.executor.getViewState().autoRotate).toBe(true);
    expect(
      f.bus.dispatch(
        f.input(
          'gesture',
          'ROTATE',
          'START',
          { yaw: 0, pitch: 0, dt: 0 },
          'gesture-start',
        ),
      ).accepted,
    ).toBe(true);
    expect(f.executor.getViewState().autoRotate).toBe(false);
  });
  it('a manual autorotate action cancels an existing transition and retains its requested enabled state', () => {
    const f = fixture();
    f.adapter('agent').send('FOCUS', 'TRIGGER', { lat: 0, lon: 0 });
    f.adapter('ui').send('SET_AUTOROTATE', 'TRIGGER', { enabled: true });
    expect(f.executor.getViewState()).toMatchObject({
      transition: 'IDLE',
      autoRotate: true,
    });
  });
  it('manual input immediately cancels Agent focus before motion, emits traceable ownership and blocks gesture', () => {
    const f = fixture();
    f.adapter('agent').send(
      'FOCUS',
      'TRIGGER',
      { lat: 35, lon: 120 },
      'agent-focus',
    );
    expect(f.executor.getViewState().transition).toBe('FOCUS');
    f.set(120);
    f.mouse.start();
    expect(f.executor.getViewState().transition).toBe('IDLE');
    expect(f.executor.getViewState().autoRotate).toBe(false);
    expect(f.cancellations).toContainEqual({
      source: 'agent',
      reason: 'PREEMPTED',
    });
    expect(
      f.bus.dispatch(
        f.input(
          'gesture',
          'ROTATE',
          'UPDATE',
          { yaw: 0.01, pitch: 0, dt: 0.02 },
          'blocked',
        ),
      ).reason,
    ).toBe('SOURCE_LOCKED');
    expect(
      f.events.filter((e) => e.type === 'SOURCE_CHANGED').map((e) => e.source),
    ).toEqual(['agent', 'mouse']);
    expect(
      f.events.find(
        (e) => e.type === 'COMMAND_RESULT' && e.id.includes('agent-test'),
      ),
    ).toMatchObject({ traceId: 'agent-focus', accepted: true });
    f.set(921);
    expect(
      f.bus.dispatch(
        f.input(
          'gesture',
          'ROTATE',
          'START',
          { yaw: 0, pitch: 0, dt: 0 },
          'start',
          'gesture-flow',
        ),
      ).accepted,
    ).toBe(true);
    expect(f.bus.getState().owner).toBe('gesture');
    expect(f.events.at(-1).traceId).toBe('gesture-flow');
  });
  it('coalesces motion and cancels pending tails on UI reset, with duplicate edges causing no effects', () => {
    const f = fixture();
    const input = (id) =>
      f.input(
        'gesture',
        'ROTATE',
        'UPDATE',
        { yaw: 0.01, pitch: 0, dt: 0.02 },
        id,
        'flow',
      );
    f.bus.dispatch(input('a'));
    f.set(101);
    f.bus.dispatch(input('b'));
    expect(f.bus.getState().pending).toBe(1);
    const reset = f.input('ui', 'RESET', 'TRIGGER', {}, 'reset', 'reset-flow');
    expect(f.bus.dispatch(reset).accepted).toBe(true);
    expect(f.bus.getState().pending).toBe(0);
    const count = f.commands.length,
      eventCount = f.events.length;
    expect(f.bus.dispatch(reset).reason).toBe('DUPLICATE');
    expect(f.commands).toHaveLength(count);
    expect(f.events).toHaveLength(eventCount);
    f.set(130);
    f.bus.flush();
    expect(f.commands).toHaveLength(count);
    expect(f.commands.filter((x) => x.command.type === 'ROTATE')).toHaveLength(
      1,
    );
  });
  it('fist cancels only gesture and terminal stale sources never cancel a current manual transition', () => {
    const f = fixture();
    f.bus.dispatch(
      f.input(
        'gesture',
        'ROTATE',
        'UPDATE',
        { yaw: 0.01, pitch: 0, dt: 0.02 },
        'move',
      ),
    );
    f.set(101);
    f.bus.dispatch(
      f.input(
        'gesture',
        'ROTATE',
        'UPDATE',
        { yaw: 0.01, pitch: 0, dt: 0.02 },
        'pending',
      ),
    );
    f.bus.setGesturePaused(true);
    expect(f.bus.getState()).toMatchObject({
      pending: 0,
      owner: null,
      gesturePaused: true,
    });
    f.adapter('ui').send('RESET', 'TRIGGER', {});
    f.bus.dispatch(f.input('gesture', 'ROTATE', 'END', {}, 'end'));
    expect(f.executor.getViewState().transition).toBe('RESET');
    expect(f.bus.getState().owner).toBe('ui');
    f.bus.setGesturePaused(true);
    expect(f.executor.getViewState().transition).toBe('RESET');
    f.adapter('keyboard').send('CANCEL', 'TRIGGER', {});
    expect(f.executor.getViewState().transition).toBe('IDLE');
  });
  it('selection emits only validated pointers and cancellation, never fabricates a geographic result', () => {
    const f = fixture();
    f.bus.dispatch(
      f.input(
        'gesture',
        'SELECT',
        'START',
        { pointer: { x: 0.5, y: 0.6 } },
        'select',
        'select-flow',
      ),
    );
    expect(f.selections.at(-1)).toMatchObject({
      type: 'SELECT_POINTER',
      pointer: { x: 0.5, y: 0.6 },
      traceId: 'select-flow',
    });
    f.bus.dispatch(f.input('gesture', 'SELECT', 'CANCEL', {}, 'cancel'));
    expect(f.selections.at(-1)).toEqual({
      type: 'SELECT_CANCEL',
      source: 'gesture',
    });
    expect(f.commands.some((x) => x.command.type === 'SELECT_GEO')).toBe(false);
  });
  it('handler and observer failures stay visible and do not poison the next valid command', () => {
    const f = fixture({
      onEvent: () => {
        throw new Error('observer fault');
      },
    });
    f.fail();
    expect(f.adapter('ui').send('RESET', 'TRIGGER', {}).reason).toBe(
      'HANDLER_FAILED',
    );
    expect(f.adapter('ui').send('RESET', 'TRIGGER', {}).accepted).toBe(true);
    expect(f.bus.getState().observerErrors).toBeGreaterThan(0);
  });
  it('expiry, explicit lifecycle stop and disposal drain pending movement and notify cancellation', () => {
    const f = fixture();
    f.bus.dispatch(
      f.input(
        'gesture',
        'ROTATE',
        'UPDATE',
        { yaw: 0.01, pitch: 0, dt: 0.02 },
        'one',
      ),
    );
    f.set(101);
    f.bus.dispatch(
      f.input(
        'gesture',
        'ROTATE',
        'UPDATE',
        { yaw: 0.01, pitch: 0, dt: 0.02 },
        'two',
      ),
    );
    f.set(282);
    f.bus.flush();
    expect(f.bus.getState()).toMatchObject({ owner: null, pending: 0 });
    expect(f.cancellations).toContainEqual({
      source: 'gesture',
      reason: 'LEASE_EXPIRED',
    });
    f.adapter('agent').send('FOCUS', 'TRIGGER', { lat: 0, lon: 0 });
    f.bus.cancelAll('PAGE_HIDDEN');
    expect(f.executor.getViewState().transition).toBe('IDLE');
    expect(f.cancellations).toContainEqual({
      source: 'agent',
      reason: 'PAGE_HIDDEN',
    });
    f.bus.dispose();
    const count = f.commands.length;
    expect(f.adapter('ui').send('RESET', 'TRIGGER', {}).reason).toBe(
      'DISPOSED',
    );
    f.bus.flush();
    f.bus.dispose();
    expect(f.commands).toHaveLength(count);
  });
});
