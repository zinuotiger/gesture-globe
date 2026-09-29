import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SceneManager } from '../../src/globe/index.ts';
import { defaults } from '../../src/config/index.ts';

function fixture() {
  const calls = { renders: 0, disposals: 0, losses: 0, removes: 0, sizes: [] };
  const frames = new Map();
  const errors = [];
  let sequence = 0;
  let resize;
  const events = new Map();
  const timers = new Map();
  const host = {
    clientWidth: 800,
    clientHeight: 400,
    dataset: {},
    append() {},
  };
  const renderer = {
    setPixelRatio(ratio) {
      calls.ratio = ratio;
    },
    domElement: {
      addEventListener(name, callback) {
        events.set(name, callback);
      },
      removeEventListener(name) {
        events.delete(name);
      },
      setAttribute() {},
      remove() {
        calls.removes++;
      },
    },
    setSize(...args) {
      calls.sizes.push(args);
    },
    render(scene, camera) {
      assert.equal(scene.isScene, true);
      assert.equal(camera.isPerspectiveCamera, true);
      calls.renders++;
    },
    dispose() {
      calls.disposals++;
    },
    forceContextLoss() {
      calls.losses++;
    },
  };
  const platform = {
    createRenderer: () => renderer,
    requestFrame(callback) {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    pixelRatio: () => 3,
    setTimer(callback) {
      timers.set(++sequence, callback);
      return sequence;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    onResize(_host, callback) {
      resize = callback;
      return () => {
        resize = undefined;
      };
    },
  };
  const scene = new SceneManager(
    host,
    defaults,
    (error) => errors.push(error),
    platform,
  );
  return {
    scene,
    host,
    renderer,
    frames,
    calls,
    errors,
    events,
    timers,
    resize: () => resize?.(),
    hasResize: () => !!resize,
    tick() {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback(0);
    },
  };
}
test('single RAF survives repeated start/stop and dispose releases owned resources', () => {
  const f = fixture();
  assert.equal(f.scene.camera.aspect, 2);
  assert.equal(f.calls.ratio, defaults.globe.maxPixelRatio);
  assert.deepEqual(
    f.scene.camera.position.toArray(),
    Object.values(f.scene.rig.getPosition()),
  );
  f.scene.start();
  f.scene.start();
  assert.equal(f.frames.size, 1);
  f.tick();
  f.tick();
  assert.equal(f.calls.renders, 2);
  f.scene.rig.rotate(0.1, 0.1, 0.05);
  f.tick();
  assert.deepEqual(
    f.scene.camera.position.toArray(),
    Object.values(f.scene.rig.getPosition()),
  );
  assert.equal(f.scene.scene.rotation.y, 0);
  assert.equal(f.host.dataset.renderState, 'rendered');
  const stale = [...f.frames.values()][0];
  f.scene.stop();
  f.scene.stop();
  stale(0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.calls.renders, 3);
  f.scene.start();
  f.tick();
  f.scene.dispose();
  f.scene.dispose();
  f.scene.start();
  f.scene.resize();
  assert.equal(f.frames.size, 0);
  assert.equal(f.hasResize(), false);
  assert.equal(f.calls.disposals, 1);
  assert.equal(f.calls.losses, 1);
  assert.equal(f.calls.removes, 1);
});
test('render observations run after real render and cannot break rendering on diagnostic failure', () => {
  const f = fixture();
  let observed = 0;
  f.scene.onFrameRendered((time) => {
    assert.ok(Number.isFinite(time));
    assert.equal(f.calls.renders, ++observed);
    throw new Error('diagnostic fault');
  });
  f.scene.start();
  f.tick();
  f.tick();
  assert.equal(observed, 2);
  assert.equal(f.scene.getRenderObserverErrors(), 2);
  assert.equal(f.errors.length, 0);
  assert.equal(f.frames.size, 1);
  f.scene.dispose();
});
test('resize updates projection; zero-size host skips rendering until visible', () => {
  const f = fixture();
  f.host.clientWidth = 300;
  f.host.clientHeight = 600;
  f.resize();
  assert.equal(f.scene.camera.aspect, 0.5);
  assert.deepEqual(f.calls.sizes.at(-1), [300, 600, false]);
  f.host.clientHeight = 0;
  f.resize();
  f.scene.start();
  f.tick();
  assert.equal(f.calls.renders, 0);
  assert.equal(f.scene.camera.aspect, 0.5);
  f.host.clientHeight = 300;
  f.resize();
  f.tick();
  assert.equal(f.calls.renders, 1);
  f.scene.dispose();
});
test('render exception stops RAF and reports failure, not a fabricated success', () => {
  const f = fixture();
  f.renderer.render = () => {
    throw new Error('GPU render failure');
  };
  f.scene.start();
  f.tick();
  assert.equal(f.frames.size, 0);
  assert.match(f.errors[0].message, /GPU render failure/);
  assert.equal(f.host.dataset.renderState, 'failed');
  f.scene.dispose();
});
test('quality changes renderer budget without losing rig, transition or scene identity', () => {
  const f = fixture();
  const originalScene = f.scene.scene;
  const originalCamera = f.scene.camera;
  f.scene.rig.rotate(0.2, 0.1, 0.1);
  const view = f.scene.getViewState();
  for (const [quality, ratio] of [
    ['LOW', 1],
    ['MEDIUM', 1.5],
    ['HIGH', 1.75],
    ['AUTO', 1.75],
  ]) {
    assert.equal(f.scene.setQuality(quality), true);
    assert.equal(f.calls.ratio, ratio);
    assert.deepEqual(f.scene.getViewState(), view);
    assert.equal(f.scene.scene, originalScene);
    assert.equal(f.scene.camera, originalCamera);
  }
  assert.equal(f.scene.setQuality('invalid'), false);
  f.scene.dispose();
  assert.equal(f.scene.setQuality('LOW'), false);
});
test('context loss pauses once, restores one RAF and preserves view; disposal removes recovery ownership', () => {
  const f = fixture();
  const states = [];
  f.scene.onContextState((state) => states.push(state));
  f.scene.start();
  const view = f.scene.getViewState();
  let prevented = 0;
  const lost = () =>
    f.events.get('webglcontextlost')({
      preventDefault() {
        prevented++;
      },
    });
  lost();
  lost();
  assert.equal(prevented, 1);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 1);
  assert.equal(f.host.dataset.renderState, 'context-lost');
  f.scene.start();
  assert.equal(f.frames.size, 0);
  assert.equal(f.scene.applyCommand({}), false);
  f.events.get('webglcontextrestored')();
  f.events.get('webglcontextrestored')();
  assert.equal(f.frames.size, 1);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.scene.getViewState(), view);
  f.tick();
  assert.equal(f.host.dataset.renderState, 'rendered');
  assert.deepEqual(states, ['ready', 'lost', 'ready']);
  lost();
  const stale = [...f.timers.values()][0];
  f.scene.dispose();
  stale();
  assert.equal(f.timers.size, 0);
  assert.equal(f.events.size, 0);
  assert.equal(f.host.dataset.renderState, 'disposed');
});
test('unrestored context enters static fallback and ignores late restore; explicit stop forbids resume', () => {
  const f = fixture();
  f.scene.start();
  f.events.get('webglcontextlost')({ preventDefault() {} });
  [...f.timers.values()][0]();
  assert.equal(f.host.dataset.renderState, 'failed');
  f.events.get('webglcontextrestored')();
  f.scene.start();
  assert.equal(f.frames.size, 0);
  f.scene.dispose();
  const stopped = fixture();
  stopped.scene.start();
  stopped.events.get('webglcontextlost')({ preventDefault() {} });
  stopped.scene.stop();
  stopped.events.get('webglcontextrestored')();
  assert.equal(stopped.frames.size, 0);
  stopped.scene.dispose();
});
