import { test, expect } from 'vitest';
import { CommandBus, createStepInput } from '../../src/interaction/index.ts';
import { AppStore } from '../../src/app/index.ts';
import { defaults } from '../../src/config/index.ts';
function exercise(reenter) {
  let time = 1,
    bus;
  const now = () => ++time,
    store = new AppStore(defaults),
    events = [];
  store.dispatch({ type: 'APP_BOOTSTRAPPED', atMs: 0, available: true });
  bus = new CommandBus(
    defaults,
    now,
    () => ({ distance: 3 }),
    () => true,
    {
      onEvent(event) {
        if (event.type !== 'SOURCE_CHANGED') return;
        events.push(event.source);
        const deadline = reenter
          ? (bus.getState().expiresAtMs ?? 0)
          : event.source
            ? event.atMs + defaults.interaction.mouseLockMs
            : 0;
        store.dispatch({
          type: 'CONTROL_SOURCE_LOCKED',
          atMs: event.atMs,
          source: event.source ?? 'NONE',
          lockUntilMs: deadline,
        });
      },
    },
  );
  const input = createStepInput('ui', bus, now, 'regression', defaults);
  const first = input('right');
  time += defaults.interaction.mouseLockMs + 1; // lease expires between render flushes
  const next = input('right');
  const state = store.getState();
  bus.dispose();
  return { first, next, state, events };
}
test('old synchronous observer re-entry reproduces rejected first action after lease expiry', () => {
  const result = exercise(true);
  expect(result.first.accepted).toBe(true);
  expect(result.next).toMatchObject({
    accepted: false,
    reason: 'SOURCE_LOCKED',
  });
});
test('event-only App feedback preserves a fresh manual command and truthful source after expiry', () => {
  const result = exercise(false);
  expect(result.first.accepted).toBe(true);
  expect(result.next.accepted).toBe(true);
  expect(result.state.control.source).toBe('ui');
  expect(result.state.diagnostics.stateViolations).toBe(0);
  expect(result.events.slice(0, 3)).toEqual(['ui', null, 'ui']);
});
