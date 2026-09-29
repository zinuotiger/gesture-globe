import assert from 'node:assert/strict';
import { test } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import { StreamController } from '../../src/camera/index.ts';
import { fakeStream } from '../fixtures/camera-stream.mjs';
test('start/stop are idempotent and mute/ended events release all owned listeners', async () => {
  const f = fakeStream();
  let calls = 0;
  const camera = new StreamController(defaults, {
    request: async () => {
      calls++;
      return { ok: true, value: f.stream };
    },
  });
  const first = camera.start();
  assert.equal(camera.start(), first);
  assert.equal((await first).ok, true);
  await camera.start();
  assert.equal(calls, 1);
  f.track.muted = true;
  f.track.fire('mute');
  assert.equal(camera.getState().phase, 'MUTED');
  f.track.muted = false;
  f.track.fire('unmute');
  assert.equal(camera.getState().phase, 'ACTIVE');
  f.track.readyState = 'ended';
  f.track.fire('ended');
  assert.equal(camera.getState().error.code, 'E-CAM-006');
  assert.equal(f.track.stops, 1);
  assert.equal(camera.getStream(), undefined);
  assert.ok([...f.listeners.values()].every((set) => set.size === 0));
  camera.stop();
  camera.stop();
  camera.dispose();
  camera.dispose();
  assert.equal(f.track.stops, 1);
  assert.equal((await camera.start()).ok, false);
});
test('cancelled start cannot attach a late stream or replace a newer active generation', async () => {
  const old = fakeStream(),
    next = fakeStream();
  let grant;
  let calls = 0;
  const camera = new StreamController(defaults, {
    request: () =>
      ++calls === 1
        ? new Promise((resolve) => {
            grant = resolve;
          })
        : Promise.resolve({ ok: true, value: next.stream }),
  });
  const pending = camera.start();
  camera.stop();
  await camera.start();
  grant({ ok: true, value: old.stream });
  assert.equal((await pending).ok, false);
  assert.equal(old.track.stops, 1);
  assert.equal(next.track.stops, 0);
  assert.equal(camera.getStream(), next.stream);
  camera.stop();
  assert.equal(next.track.stops, 1);
});
test('empty/ended/audio stream is refused, not reported as camera success', async () => {
  for (const mode of ['empty', 'ended', 'audio']) {
    const f = fakeStream();
    if (mode === 'empty') f.stream.getVideoTracks = () => [];
    if (mode === 'ended') f.track.readyState = 'ended';
    if (mode === 'audio') f.stream.getAudioTracks = () => [f.track];
    const camera = new StreamController(defaults, {
      request: async () => ({ ok: true, value: f.stream }),
    });
    assert.equal((await camera.start()).ok, false);
    assert.equal(f.track.stops, 1);
    assert.equal(camera.getStream(), undefined);
    camera.dispose();
  }
});
