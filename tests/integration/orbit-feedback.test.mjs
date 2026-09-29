import { test, expect } from 'vitest';
import { PerspectiveCamera } from 'three';
import { defaults } from '../../src/config/index.ts';
import { CameraRig, CommandExecutor } from '../../src/globe/index.ts';
import { OrbitControlAdapter } from '../../src/globe/controls/OrbitControlAdapter.ts';
import { CommandBus, createMouseInput } from '../../src/interaction/index.ts';

test.each([
  [-1, 8],
  [1, 8],
  [-1, 1000 / 144],
  [1, 1000 / 144],
  [-1, 1000 / 60],
  [1, 1000 / 60],
])(
  'real Orbit wheel %i at %f ms converges without reversal across command buffering',
  (direction, interval) => {
    const document = new globalThis.EventTarget();
    const element = new globalThis.EventTarget();
    Object.assign(element, {
      style: {},
      clientWidth: 800,
      clientHeight: 500,
      getRootNode: () => document,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 500,
      }),
    });
    let now = 0;
    const rig = new CameraRig(defaults);
    const camera = new PerspectiveCamera(45, 1.6, 0.1, 100);
    const p = rig.getPosition();
    camera.position.set(p.x, p.y, p.z);
    const executor = new CommandExecutor(rig, defaults);
    const bus = new CommandBus(
      defaults,
      () => now,
      () => executor.getViewState(),
      (c) => executor.execute(c, now),
    );
    const adapter = new OrbitControlAdapter(
      camera,
      element,
      rig,
      defaults,
      createMouseInput(bus, () => now, 'regression'),
    );
    adapter.update(0);
    const wheel = new globalThis.Event('wheel', { cancelable: true });
    Object.assign(wheel, {
      deltaY: direction * 120,
      deltaMode: 0,
      clientX: 400,
      clientY: 250,
      ctrlKey: false,
    });
    element.dispatchEvent(wheel);
    const views = [rig.getView()];
    for (let i = 1; i <= 300; i++) {
      // Separate render timestamps from the dispatch clock, including sub-ms jitter.
      now = i * interval + (i % 3) * 0.13;
      adapter.update(i * interval);
      bus.flush();
      views.push(rig.getView());
    }
    try {
      expect(
        direction * (views.at(-1).distance - views[0].distance),
      ).toBeGreaterThan(0.05);
      for (let i = 1; i < views.length; i++) {
        expect(
          direction * (views[i].distance - views[i - 1].distance),
        ).toBeGreaterThanOrEqual(-1e-12);
        expect(views[i].azimuth).toBeCloseTo(views[0].azimuth, 12);
        expect(views[i].polar).toBeCloseTo(views[0].polar, 12);
      }
    } finally {
      adapter.dispose();
      bus.dispose();
      executor.dispose();
    }
  },
);
