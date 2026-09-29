import { test, expect } from 'vitest';
import {
  AppStore,
  selectCanGesture,
  selectPrivacy,
} from '../../src/app/index.ts';
import { StatusPresenter } from '../../src/app/StatusPresenter.ts';
import { topStatusText } from '../../src/ui/index.ts';
import { defaults } from '../../src/config/index.ts';
const token = { sessionId: 's1', operationId: 'op1' };
function setup() {
  const store = new AppStore(defaults);
  let t = 0;
  const send = (action) => store.dispatch({ atMs: ++t, ...action });
  send({ type: 'APP_BOOTSTRAPPED', available: true });
  return { store, send };
}
function ready(send, session = token) {
  send({ type: 'CAMERA_STATE_CHANGED', status: 'STREAMING' });
  send({ type: 'GESTURE_ENABLE_REQUESTED', ...session });
  send({ type: 'VISION_STATE_CHANGED', status: 'READY', ...session });
}
const active = (kind = 'ROTATE') => ({
  type: 'VISION_FRAME_APPLIED',
  ...token,
  hand: 'READY',
  gesture: { status: 'ACTIVE', kind, confidence: 0.9, candidate: 'Open_Palm' },
});
test('preferences are validated immutable scalar state and cannot inject device IDs', () => {
  const { store, send } = setup();
  const preferences = store.getState().preferences;
  expect(
    send({
      type: 'PREFERENCES_CHANGED',
      value: { ...preferences, deviceId: 'private' },
    }),
  ).toBe(false);
  expect(store.getState().preferences).toEqual(preferences);
  expect(
    send({
      type: 'PREFERENCES_CHANGED',
      value: { ...preferences, sensitivity: 1.5 },
    }),
  ).toBe(true);
  expect(store.getState().preferences.sensitivity).toBe(1.5);
  expect(Object.isFrozen(store.getState().preferences)).toBe(true);
});
test('camera/vision/gesture invariants, stale session and operation rejection, safe close', () => {
  const { store, send } = setup();
  expect(selectPrivacy(store.getState())).toBe('CAMERA_OFF');
  expect(send(active())).toBe(false);
  ready(send);
  expect(send(active())).toBe(true);
  expect(selectCanGesture(store.getState())).toBe(true);
  expect(store.getState().appPhase).toBe('ACTIVE');
  send({ type: 'VISION_STATE_CHANGED', status: 'PAUSED', ...token });
  expect(store.getState().gesture.kind).toBe('NONE');
  expect(send(active())).toBe(false);
  send({ type: 'CAMERA_STATE_CHANGED', status: 'OFF' });
  expect(store.getState()).toMatchObject({
    sessionId: null,
    visionStatus: 'OFF',
    handStatus: 'UNKNOWN',
  });
  expect(
    send({ type: 'VISION_STATE_CHANGED', status: 'READY', ...token }),
  ).toBe(false);
  ready(send, { sessionId: 's2', operationId: 'op2' });
  expect(send({ ...active(), sessionId: 's2' })).toBe(false);
  expect(
    store.getState().errors.filter((e) => e.code === 'E-APP-STATE-001'),
  ).toHaveLength(1);
});
test('manual priority, dwell invariant, new session invalidation and FATAL source rejection', () => {
  const { store, send } = setup();
  ready(send);
  expect(send({ type: 'SELECTION_PROGRESS_CHANGED', progress: 0.5 })).toBe(
    false,
  );
  send(active('SELECT'));
  send({ type: 'CONTROL_SOURCE_LOCKED', source: 'gesture', lockUntilMs: 1000 });
  expect(send({ type: 'SELECTION_PROGRESS_CHANGED', progress: 0.5 })).toBe(
    true,
  );
  send({ type: 'CONTROL_SOURCE_LOCKED', source: 'mouse', lockUntilMs: 1000 });
  expect(store.getState()).toMatchObject({
    gesture: { kind: 'NONE' },
    selection: { progress: 0 },
  });
  send({
    type: 'GESTURE_ENABLE_REQUESTED',
    sessionId: 'next',
    operationId: 'next',
  });
  expect(store.getState()).toMatchObject({
    control: { source: 'NONE' },
    gesture: { kind: 'NONE' },
    selection: { progress: 0 },
  });
  send({
    type: 'ERROR_RAISED',
    error: {
      schemaVersion: 1,
      id: 'fatal',
      code: 'E-APP-BOOT-001',
      module: 'M01',
      severity: 'FATAL',
      recoverable: false,
      retryPolicy: 'NONE',
      messageKey: 'fatal',
      atMs: 0,
    },
  });
  expect(
    send({
      type: 'CONTROL_SOURCE_LOCKED',
      source: 'gesture',
      lockUntilMs: 1000,
    }),
  ).toBe(false);
  expect(store.getState()).toMatchObject({
    appPhase: 'FATAL',
    control: { source: 'NONE' },
  });
});
test('independent immutable slices, unchanged events, disposal and invalid timestamps', () => {
  const { store, send } = setup();
  const values = [];
  const remove = store.subscribe(
    (s) => s.selection,
    (s) => values.push(s),
  );
  send({ type: 'QUALITY_CHANGED', value: 'LOW' });
  expect(values).toHaveLength(1);
  const value = {
    schemaVersion: 1,
    selectionId: 'one',
    selectedAtMs: 1,
    latitude: 10,
    longitude: 20,
  };
  send({ type: 'SELECTION_COMMITTED', value, cityStatus: 'LOADING' });
  value.latitude = 90;
  expect(store.getState().selection.value.latitude).toBe(10);
  expect(Object.isFrozen(store.getState().selection.value)).toBe(true);
  send({ type: 'QUALITY_CHANGED', value: 'HIGH' });
  expect(values).toHaveLength(2);
  expect(
    store.dispatch({ type: 'QUALITY_CHANGED', value: 'LOW', atMs: NaN }),
  ).toBe(false);
  expect(
    store.dispatch({ type: 'QUALITY_CHANGED', value: 'LOW', atMs: 0 }),
  ).toBe(false);
  remove();
  send({ type: 'APP_DISPOSED' });
  expect(send({ type: 'CAMERA_STATE_CHANGED', status: 'STREAMING' })).toBe(
    false,
  );
  store.dispose();
});
test('status presenter coalesces high frequency updates at exactly at most 4Hz; labels do not imply active candidates', () => {
  const { store, send } = setup(),
    rendered = [];
  const presenter = new StatusPresenter(4, (s) =>
    rendered.push(topStatusText(s)),
  );
  store.subscribe(
    (s) => s,
    (s) => presenter.offer(s),
  );
  presenter.flush(0);
  ready(send);
  send({
    ...active(),
    gesture: {
      status: 'CANDIDATE',
      kind: 'NONE',
      confidence: 0.8,
      candidate: 'Open_Palm',
    },
  });
  for (let t = 1; t < 250; t++) presenter.flush(t);
  expect(rendered).toHaveLength(1);
  presenter.flush(250);
  expect(rendered).toHaveLength(2);
  expect(rendered[1]).toContain('候选，尚未执行');
  presenter.dispose();
  presenter.offer(store.getState());
  presenter.flush(1000);
  expect(rendered).toHaveLength(2);
  expect(() => new StatusPresenter(5, () => {})).toThrow('4Hz');
});
test('unavailable globe remains degraded through unrelated camera events; state never contains live resources', () => {
  const { store, send } = setup();
  send({ type: 'APP_BOOTSTRAPPED', available: false });
  send({ type: 'CAMERA_STATE_CHANGED', status: 'REQUESTING' });
  expect(store.getState().appPhase).toBe('DEGRADED');
  expect(
    send({
      type: 'GLOBE_VIEW_CHANGED',
      view: { ...store.getState().view, target: new Date() },
    }),
  ).toBe(false);
});
test('one throwing subscriber cannot prevent other state consumers or future actions', () => {
  const { store, send } = setup();
  let values = 0;
  store.subscribe(
    (s) => s.qualityLevel,
    (value) => {
      if (value === 'LOW') throw new Error('fixture observer failure');
    },
  );
  store.subscribe(
    (s) => s.qualityLevel,
    () => values++,
  );
  expect(send({ type: 'QUALITY_CHANGED', value: 'LOW' })).toBe(true);
  expect(values).toBe(2);
  expect(store.getState().errors[0].code).toBe('E-APP-STATE-001');
  expect(send({ type: 'QUALITY_CHANGED', value: 'HIGH' })).toBe(true);
  expect(values).toBe(3);
});
