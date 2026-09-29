import assert from 'node:assert/strict';
import { test } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import {
  PermissionController,
  StreamController,
} from '../../src/camera/index.ts';
import { fakeStream } from '../fixtures/camera-stream.mjs';
test('ten complete permission-to-stream cycles leave no live tracks, request timers or listeners', async () => {
  const streams = [],
    timers = new Map();
  let id = 0;
  const permission = new PermissionController(defaults, {
    environment: () => ({
      secure: true,
      mediaAvailable: true,
      pageActive: true,
    }),
    getUserMedia: async (constraints) => {
      assert.equal(constraints.audio, false);
      const f = fakeStream();
      streams.push(f);
      return f.stream;
    },
    setTimer: (fn) => {
      timers.set(++id, fn);
      return id;
    },
    clearTimer: (key) => timers.delete(key),
    now: () => 100,
  });
  const camera = new StreamController(defaults, permission);
  for (let i = 0; i < 10; i++) {
    const first = camera.start();
    assert.equal(camera.start(), first);
    assert.equal((await first).ok, true);
    assert.equal(streams.length, i + 1);
    assert.equal(
      streams.filter((f) => f.track.readyState === 'live').length,
      1,
    );
    camera.stop();
    camera.stop();
    assert.equal(camera.getStream(), undefined);
    assert.equal(timers.size, 0);
    assert.ok(
      streams.every(
        (f) =>
          f.track.readyState === 'ended' &&
          f.track.stops === 1 &&
          [...f.listeners.values()].every((set) => set.size === 0),
      ),
    );
  }
  camera.dispose();
  assert.equal(streams.length, 10);
});
test('integrated permission cancellation settles without grant; late grant closes and never activates', async () => {
  const media = fakeStream(),
    timers = new Map();
  let grant;
  const permission = new PermissionController(defaults, {
    environment: () => ({
      secure: true,
      mediaAvailable: true,
      pageActive: true,
    }),
    getUserMedia: () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
    setTimer: (fn) => {
      timers.set(1, fn);
      return 1;
    },
    clearTimer: (id) => timers.delete(id),
    now: () => 0,
  });
  const camera = new StreamController(defaults, permission);
  const pending = camera.start();
  [...timers.values()][0]();
  assert.equal(camera.getState().phase, 'WAITING');
  camera.stop();
  assert.equal((await pending).ok, false);
  assert.equal(timers.size, 0);
  grant(media.stream);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(media.track.readyState, 'ended');
  assert.equal(media.track.stops, 1);
  assert.equal(camera.getState().phase, 'OFF');
  camera.dispose();
});
