import { describe, expect, it } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import { GesturePipeline } from '../../src/app/GesturePipeline.ts';
import { defaultPreferences } from '../../src/app/Preferences.ts';
import { LatencyTracer } from '../../src/diagnostics/index.ts';
import { CommandBus, createInputAdapter } from '../../src/interaction/index.ts';
import {
  CameraRig,
  CommandExecutor,
  TransitionController,
} from '../../src/globe/index.ts';
import { gestureFrame, pinchFrame } from '../fixtures/gesture-frames.mjs';
import {
  gestureReplayFixture,
  replayNames,
} from '../fixtures/gesture-replays.mjs';

function fixture(observerThrows = false) {
  let time = 0;
  const latency = new LatencyTracer({ capacity: 600, windowMs: 5000 });
  const events = [];
  const rig = new CameraRig(defaults),
    commands = [],
    selections = [];
  const executor = new CommandExecutor(
    rig,
    defaults,
    new TransitionController(rig, defaults),
  );
  const bus = new CommandBus(
    defaults,
    () => time,
    () => executor.getViewState(),
    (command) => {
      commands.push(command);
      return executor.execute(command, time);
    },
    {
      onEvent(event) {
        events.push(event);
        if (event.type === 'INPUT_ACCEPTED')
          latency.associate(event.id, event.traceId);
        if (event.type === 'COMMAND_RESULT' && event.accepted)
          latency.command(event.traceId, event.commandType, time);
        if (event.type === 'SOURCE_CANCELLED') latency.cancel(event.traceId);
      },
      onSelection: (action) => {
        selections.push(action);
        return true;
      },
    },
  );
  const pipeline = new GesturePipeline(
    defaults,
    bus,
    () => time,
    (id, timing) => {
      if (observerThrows) throw Error('observer fault');
      latency.recordIntent(id, timing);
    },
  );
  pipeline.start('gesture-fixture');
  return {
    pipeline,
    latency,
    events,
    bus,
    rig,
    executor,
    commands,
    selections,
    set: (value) => {
      time = value;
    },
    frame(frame) {
      time = frame.resultTimeMs;
      const intents = pipeline.accept(frame);
      bus.flush();
      executor.update(time);
      return intents;
    },
    ui: createInputAdapter('ui', bus, () => time, 'pipeline'),
  };
}
describe('Frame → Intent → Command → View integration (synthetic DTOs, real engine/executor)', () => {
  it('held Victory completes the visible reset while fresh frames continue', () => {
    const f = fixture();
    f.rig.setView({ azimuth: 0.5, polar: 1.8, distance: 1.8 });
    for (let i = 0; i < 35; i++)
      f.frame(gestureFrame(i, i * 40, { gesture: 'Victory' }));
    expect(f.commands.filter((c) => c.type === 'RESET_VIEW')).toHaveLength(1);
    expect(f.rig.getView().distance).toBeCloseTo(
      defaults.globe.initialDistance,
      10,
    );
    expect(f.rig.getView().azimuth).toBeCloseTo(
      defaults.globe.initialAzimuth,
      10,
    );
    expect(f.executor.getViewState().transition).toBe('IDLE');
    f.pipeline.stop();
    f.bus.dispose();
    executorDispose(f);
  });
  it('reset renewal cannot survive lost frames or user preemption', () => {
    for (const manual of [false, true]) {
      const f = fixture();
      f.rig.setView({ azimuth: 0.5, polar: 1.8, distance: 1.8 });
      for (let i = 0; i < 8; i++)
        f.frame(gestureFrame(i, i * 40, { gesture: 'Victory' }));
      expect(f.executor.getViewState().transition).toBe('RESET');
      if (manual) {
        f.ui.send('ROTATE', 'UPDATE', { yaw: 0.02, pitch: 0, dt: 0.04 });
        for (let i = 8; i < 16; i++)
          f.frame(gestureFrame(i, i * 40, { gesture: 'Victory' }));
        expect(f.bus.getState().owner).toBe('ui');
      } else {
        f.set(500);
        f.bus.flush();
        f.executor.update(500);
      }
      expect(f.executor.getViewState().transition).toBe('IDLE');
      expect(f.rig.getView().distance).not.toBe(defaults.globe.initialDistance);
      f.pipeline.stop();
      f.bus.dispose();
      executorDispose(f);
    }
  });
  it('M06 trace correlates continuous motion and discrete reset to explicit render submission only', () => {
    const f = fixture();
    for (let i = 0; i < 12; i++) {
      f.frame(gestureFrame(i, i * 40, { x: 0.35 + i * 0.002 }));
      f.latency.rendered(i * 40 + 5);
    }
    const motion = f.commands.filter((c) => c.type === 'ROTATE');
    expect(motion.length).toBeGreaterThan(0);
    expect(new Set(motion.map((c) => c.traceId)).size).toBe(1);
    const sample = f.latency.snapshot(445);
    expect(sample.captureToRender.count).toBeGreaterThan(0);
    expect(sample.last.traceId).toBe(motion.at(-1).traceId);
    for (let i = 12; i < 20; i++) {
      f.frame(gestureFrame(i, i * 40, { gesture: 'Victory' }));
      f.latency.rendered(i * 40 + 5);
    }
    const reset = f.commands.find((c) => c.type === 'RESET_VIEW');
    expect(reset.traceId).not.toBe(motion[0].traceId);
    expect(f.latency.snapshot(765).last.traceId).toBe(reset.traceId);
    expect(f.latency.snapshot(765).last.kind).toBe('RESET');
    f.pipeline.stop();
    f.bus.dispose();
    f.executor.dispose();
  });
  it('throwing diagnostic observers cannot change classification or executed movement', () => {
    const normal = fixture(),
      faulty = fixture(true);
    for (let i = 0; i < 12; i++) {
      const frame = gestureFrame(i, i * 40, { x: 0.35 + i * 0.002 });
      expect(faulty.frame(frame)).toEqual(normal.frame(frame));
    }
    expect(faulty.commands).toEqual(normal.commands);
    expect(faulty.pipeline.getState().observerErrors).toBeGreaterThan(0);
    for (const f of [normal, faulty]) {
      f.pipeline.stop();
      f.bus.dispose();
      f.executor.dispose();
    }
  });
  it('runtime gesture gain and inversion change real commands without changing classification or IDs', () => {
    const normal = fixture(),
      adjusted = fixture();
    adjusted.pipeline.setPreferences({
      ...defaultPreferences(),
      sensitivity: 0.5,
      invertX: true,
    });
    for (let i = 0; i < 12; i++) {
      const frame = gestureFrame(i, i * 40, { x: 0.35 + i * 0.002 });
      expect(adjusted.frame(frame)).toEqual(normal.frame(frame));
    }
    const base = normal.commands.filter((c) => c.type === 'ROTATE');
    const actual = adjusted.commands.filter((c) => c.type === 'ROTATE');
    expect(base.length).toBeGreaterThan(0);
    expect(actual.length).toBe(base.length);
    for (let i = 0; i < base.length; i++) {
      expect(actual[i].yaw).toBeCloseTo(-base[i].yaw * 0.5, 12);
      expect(actual[i].pitch).toBeCloseTo(base[i].pitch * 0.5, 12);
    }
  });
  it('all five gestures reach motion, clutch, reset or selection pointer with actual bounded view changes', () => {
    const f = fixture(),
      kinds = new Set();
    let id = 0;
    const feed = (count, make) => {
      for (let n = 0; n < count; n++, id++)
        for (const intent of f.frame(make(id, id * 40, n)))
          kinds.add(intent.kind);
    };
    feed(8, (i, t, n) => gestureFrame(i, t, { x: 0.35 + n * 0.004 }));
    expect(f.commands.some((c) => c.type === 'ROTATE' && c.yaw !== 0)).toBe(
      true,
    );
    feed(3, (i, t) => gestureFrame(i, t, { gesture: 'Closed_Fist' }));
    expect(f.bus.getState().gesturePaused).toBe(true);
    const stopped = f.rig.getView();
    feed(4, (i, t, n) =>
      gestureFrame(i, t, { gesture: 'Closed_Fist', x: 0.35 + n * 0.01 }),
    );
    expect(f.rig.getView()).toEqual(stopped);
    feed(4, (i, t) => gestureFrame(i, t, { gesture: 'None' }));
    feed(15, (i, t) => pinchFrame(i, t, 0.2));
    const beforeZoom = f.rig.getView().distance;
    feed(5, (i, t, n) => pinchFrame(i, t, 0.2, { y: 0.45 + n * 0.004 }));
    expect(f.rig.getView().distance).not.toBe(beforeZoom);
    expect(f.commands.some((c) => c.type === 'ZOOM' && c.delta !== 0)).toBe(
      true,
    );
    feed(8, (i, t) => gestureFrame(i, t, { gesture: 'Victory' }));
    expect(f.commands.filter((c) => c.type === 'RESET_VIEW')).toHaveLength(1);
    feed(8, (i, t) => gestureFrame(i, t, { gesture: 'Pointing_Up' }));
    expect(f.selections.some((s) => s.type === 'SELECT_POINTER')).toBe(true);
    expect(kinds).toEqual(
      new Set(['ROTATE', 'PAUSE', 'ZOOM', 'RESET', 'SELECT']),
    );
    expect(f.rig.getView().distance).toBeGreaterThanOrEqual(
      defaults.globe.minDistance,
    );
    expect(f.rig.getView().distance).toBeLessThanOrEqual(
      defaults.globe.maxDistance,
    );
    f.pipeline.stop();
    f.bus.dispose();
    executorDispose(f);
  });
  it('all named regression sequences deterministically replay without NaN or unbounded queue', () => {
    for (const name of replayNames) {
      const run = () => {
        const f = fixture();
        for (const frame of gestureReplayFixture(name).frames) {
          f.frame(frame);
          expect(f.bus.getState().pending).toBeLessThanOrEqual(2);
        }
        const result = {
          view: f.executor.getViewState(),
          types: f.commands.map((c) => c.type),
        };
        f.pipeline.stop();
        f.bus.dispose();
        executorDispose(f);
        return result;
      };
      expect(run()).toEqual(run());
    }
  });
  it('manual takeover, stale/wrong session and close cannot leak pending gesture motion', () => {
    const f = fixture();
    for (let i = 0; i < 8; i++)
      f.frame(gestureFrame(i, i * 40, { x: 0.35 + i * 0.004 }));
    f.ui.send('RESET', 'TRIGGER', {});
    f.frame(gestureFrame(8, 320, { x: 0.42 }));
    expect(f.executor.getViewState().transition).toBe('RESET');
    const count = f.commands.filter((c) => c.type === 'ROTATE').length;
    f.set(1000);
    expect(f.pipeline.accept(gestureFrame(9, 350))).toEqual([]);
    expect(
      f.pipeline.accept(gestureFrame(10, 999, { sessionId: 'old' })),
    ).toEqual([]);
    f.pipeline.stop();
    expect(f.pipeline.accept(gestureFrame(11, 999))).toEqual([]);
    f.bus.flush();
    expect(f.commands.filter((c) => c.type === 'ROTATE')).toHaveLength(count);
    expect(f.pipeline.getState().rejectedFrames).toBe(3);
    f.bus.dispose();
    executorDispose(f);
  });
});
function executorDispose(f) {
  f.executor.dispose();
}
