import assert from 'node:assert/strict';
import { test } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import { VideoSource } from '../../src/camera/index.ts';
import { fakeStream } from '../fixtures/camera-stream.mjs';
function fixture() {
  const listeners = new Map(),
    timers = new Map();
  let id = 0;
  const video = {
    muted: false,
    playsInline: false,
    srcObject: null,
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    paused: true,
    ended: false,
    pause() {
      this.paused = true;
    },
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    addEventListener(name, fn) {
      listeners.set(name, fn);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
  };
  const clock = {
    now: () => 0,
    setTimer: (fn, ms) => {
      assert.equal(ms, 8000);
      timers.set(++id, fn);
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  };
  return {
    video,
    listeners,
    timers,
    source: new VideoSource(video, defaults, clock),
  };
}
test('metadata alone/zero dimensions cannot submit; actual data and dimensions unlock ephemeral source', async () => {
  const f = fixture(),
    media = fakeStream();
  const pending = f.source.bind(media.stream);
  await Promise.resolve();
  assert.equal(f.source.getFrameSource(), undefined);
  f.video.readyState = 1;
  f.video.videoWidth = 640;
  f.video.videoHeight = 480;
  f.listeners.get('loadedmetadata')();
  assert.equal(f.source.isReady(), false);
  f.video.readyState = 2;
  f.video.videoWidth = 0;
  f.listeners.get('loadeddata')();
  assert.equal(f.source.isReady(), false);
  f.video.videoWidth = 640;
  f.listeners.get('resize')();
  assert.equal((await pending).ok, true);
  assert.equal(f.source.getFrameSource(), f.video);
  assert.equal(f.video.muted, true);
  assert.equal(f.video.playsInline, true);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.timers.size, 0);
  media.track.muted = true;
  assert.equal(f.source.getFrameSource(), undefined);
  media.track.muted = false;
  f.video.videoWidth = NaN;
  assert.equal(f.source.getFrameSource(), undefined);
  f.source.unbind();
  assert.equal(f.video.srcObject, null);
  assert.equal(f.source.isReady(), false);
  f.source.dispose();
});
test('timeout/play rejection/error event detach source; stream remains controller-owned', async () => {
  for (const mode of ['timeout', 'play', 'event']) {
    const f = fixture(),
      media = fakeStream();
    if (mode === 'play')
      f.video.play = () => Promise.reject(new Error('play denied'));
    const pending = f.source.bind(media.stream);
    if (mode === 'timeout') [...f.timers.values()][0]();
    if (mode === 'event') f.listeners.get('error')();
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'E-CAM-007');
    assert.equal(f.video.srcObject, null);
    assert.equal(f.source.getFrameSource(), undefined);
    assert.equal(f.listeners.size, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(media.track.stops, 0);
    f.source.dispose();
  }
});
test('rebinding cancels old wait and dispose clears late readiness callbacks', async () => {
  const f = fixture(),
    a = fakeStream(),
    b = fakeStream();
  const first = f.source.bind(a.stream);
  const stale = f.listeners.get('loadeddata');
  const second = f.source.bind(b.stream);
  assert.equal((await first).error.reason, 'Cancelled');
  f.source.dispose();
  f.source.dispose();
  stale();
  assert.equal((await second).error.reason, 'Cancelled');
  assert.equal(f.listeners.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.video.srcObject, null);
  assert.equal((await f.source.bind(a.stream)).ok, false);
});
