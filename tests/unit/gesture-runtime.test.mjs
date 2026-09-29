import { describe, expect, it } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import { VisionWorkerClient } from '../../src/vision/index.ts';
import { GestureRuntime } from '../../src/app/GestureRuntime.ts';
import { CommandBus } from '../../src/interaction/index.ts';
import { gestureFrame } from '../fixtures/gesture-frames.mjs';
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function fixture() {
  let time = 1000;
  const ports = [],
    states = [],
    overlays = [];
  const client = new VisionWorkerClient(
    defaults,
    () => {
      const port = {
        onmessage: null,
        onerror: null,
        sent: [],
        terminated: 0,
        postMessage(message) {
          this.sent.push(message);
        },
        terminate() {
          this.terminated++;
        },
        emit(type, extra = {}) {
          this.onmessage?.({
            data: {
              schemaVersion: 1,
              sessionId: this.sent.find((m) => m.type === 'INIT').sessionId,
              type,
              ...extra,
            },
          });
        },
      };
      ports.push(port);
      return port;
    },
    () => time,
  );
  const bus = new CommandBus(
    defaults,
    () => time,
    () => ({ distance: 3 }),
    () => true,
  );
  const runtime = new GestureRuntime(
    defaults,
    bus,
    {
      isReady: () => false,
      capture: () => {
        throw new Error('No real capture in unit fixture');
      },
    },
    (state) => states.push(state),
    client,
    () => time,
    (frame) => overlays.push(frame?.frameId ?? null),
  );
  return {
    runtime,
    ports,
    states,
    overlays,
    set: (value) => {
      time = value;
    },
    dispose() {
      runtime.dispose();
      bus.dispose();
    },
  };
}
describe('gesture runtime lifecycle with explicit synthetic worker protocol', () => {
  it('distinguishes an observed but out-of-frame hand from no hand without retaining landmarks', async () => {
    const f = fixture();
    try {
      const starting = f.runtime.start(),
        p = f.ports[0];
      p.emit('READY', { modelVersion: 'synthetic-protocol' });
      await starting;
      const frame = gestureFrame(1, 999, { sessionId: p.sent[0].sessionId });
      frame.hands[0].landmarks = frame.hands[0].landmarks.map((point) => ({
        ...point,
        x: point.x + 2,
      }));
      p.emit('FRAME_RESULT', { frame });
      expect(f.runtime.getState().hand).toBe('UNREADY');
      f.set(1040);
      p.emit('FRAME_RESULT', {
        frame: {
          ...frame,
          frameId: 2,
          captureTimeMs: 1039,
          resultTimeMs: 1040,
          hands: [],
        },
      });
      expect(f.runtime.getState().hand).toBe('NO_HAND');
      expect(JSON.stringify(f.runtime.getState())).not.toContain('landmarks');
    } finally {
      f.dispose();
    }
  });
  it('creates no worker before activation, resets on pause/close and ignores delayed messages', async () => {
    const f = fixture();
    try {
      expect(f.ports).toHaveLength(0);
      const starting = f.runtime.start();
      expect(f.runtime.getState().phase).toBe('INITIALIZING');
      const p = f.ports[0];
      p.emit('READY', { modelVersion: 'synthetic-protocol' });
      await starting;
      expect(f.runtime.getState().phase).toBe('READY');
      const frame = gestureFrame(1, 999, { sessionId: p.sent[0].sessionId });
      p.emit('FRAME_RESULT', { frame });
      expect(f.runtime.getState().acceptedFrames).toBe(1);
      expect(f.overlays.at(-1)).toBe(1);
      f.runtime.setPaused(true);
      expect(f.overlays.at(-1)).toBeNull();
      p.emit('PAUSED');
      expect(f.runtime.getState().phase).toBe('PAUSED');
      f.set(1040);
      p.emit('FRAME_RESULT', {
        frame: gestureFrame(2, 1039, { sessionId: p.sent[0].sessionId }),
      });
      expect(f.runtime.getState().acceptedFrames).toBe(1);
      f.runtime.setPaused(false);
      p.emit('READY', { modelVersion: 'synthetic-protocol' });
      expect(f.runtime.getState().phase).toBe('READY');
      const late = p.onmessage;
      f.runtime.stop();
      late({
        data: {
          type: 'FRAME_RESULT',
          schemaVersion: 1,
          sessionId: p.sent[0].sessionId,
          frame,
        },
      });
      expect(f.runtime.getState().phase).toBe('STOPPED');
      expect(f.runtime.getState().acceptedFrames).toBe(1);
      expect(p.terminated).toBe(1);
    } finally {
      f.dispose();
    }
  });
  it('an old activation cannot overwrite a newer one; two crashes degrade without retry storm', async () => {
    const f = fixture();
    try {
      const old = f.runtime.start();
      f.runtime.stop();
      const current = f.runtime.start();
      f.ports[1].emit('READY', { modelVersion: 'synthetic-protocol' });
      await old;
      await current;
      expect(f.runtime.getState().phase).toBe('READY');
      f.ports[1].onerror({});
      await settle();
      expect(f.ports).toHaveLength(3);
      f.ports[2].onerror({});
      await settle();
      expect(f.runtime.getState().phase).toBe('DEGRADED');
      expect(f.runtime.getState().errorCode).toBe('E-VIS-003');
      f.runtime.tick();
      await settle();
      expect(f.ports).toHaveLength(3);
    } finally {
      f.dispose();
    }
  });
});
