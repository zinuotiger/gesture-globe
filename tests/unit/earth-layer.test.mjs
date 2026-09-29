import assert from 'node:assert/strict';
import { test } from 'vitest';
import { PerspectiveCamera, Texture, Vector3 } from 'three';
import { EarthLayer, earthGeometry, CameraRig } from '../../src/globe/index.ts';
import { defaults } from '../../src/config/index.ts';
import { geoToDirection } from '../../src/shared/index.ts';

test('north-up view places a geographically eastern neighbor to the right', () => {
  const origin = geoToDirection(30, 120, 0);
  const east = geoToDirection(30, 121, 0);
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(origin.x * 3, origin.y * 3, origin.z * 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const projected = new Vector3(east.x, east.y, east.z).project(camera);
  assert.ok(
    projected.x > 0,
    'East must appear right in the north-up outside view',
  );
});

test('Earth UV agrees with canonical longitude and first view centers East Asia', () => {
  const geometry = earthGeometry(1, 64, 32);
  const uv = geometry.getAttribute('uv');
  const positions = geometry.getAttribute('position');
  for (let i = 65; i < positions.count - 65; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const expected = (Math.atan2(-z, x) + Math.PI) / (2 * Math.PI);
    const error = Math.abs(uv.getX(i) - expected);
    assert.ok(Math.min(error, Math.abs(error - 1)) < 1e-6);
  }
  geometry.dispose();
  const p = new CameraRig(defaults).getPosition();
  assert.ok(Math.abs((Math.atan2(-p.z, p.x) * 180) / Math.PI - 120) < 1e-10);
  assert.ok(
    Math.abs(
      (Math.asin(p.y / defaults.globe.initialDistance) * 180) / Math.PI - 30,
    ) < 1e-10,
  );
});
test('day texture loads once, lights/stars/atmosphere are owned and resources dispose once', async () => {
  const earth = new EarthLayer(defaults);
  const texture = new Texture();
  const states = [];
  let loads = 0;
  let disposed = 0;
  texture.addEventListener('dispose', () => disposed++);
  const loader = async () => {
    loads++;
    return texture;
  };
  await earth.load((state) => states.push(state), loader);
  await earth.load(() => {}, loader);
  assert.deepEqual(states, ['loading', 'ready']);
  assert.equal(loads, 1);
  assert.equal(earth.earth.material.map, texture);
  assert.equal(
    earth.group.getObjectByName('stars').geometry.getAttribute('position')
      .count,
    defaults.earth.starCount,
  );
  assert.equal(
    earth.group.getObjectByName('atmosphere').material.depthWrite,
    false,
  );
  const geometries = [];
  earth.group.traverse((node) => {
    if (node.geometry)
      node.geometry.addEventListener('dispose', () =>
        geometries.push(node.name),
      );
  });
  earth.dispose();
  earth.dispose();
  assert.equal(disposed, 1);
  assert.equal(geometries.length, 3);
  assert.equal(earth.group.children.length, 0);
});
test('late texture after disposal is released; failed loading retains an explicit basic material', async () => {
  const earth = new EarthLayer(defaults);
  const texture = new Texture();
  let resolveTexture;
  let disposed = 0;
  texture.addEventListener('dispose', () => disposed++);
  const waiting = new Promise((resolve) => {
    resolveTexture = resolve;
  });
  const states = [];
  const loading = earth.load(
    (state) => states.push(state),
    () => waiting,
  );
  earth.dispose();
  resolveTexture(texture);
  await loading;
  assert.equal(disposed, 1);
  assert.deepEqual(states, ['loading']);
  const failed = new EarthLayer(defaults);
  const failure = [];
  await failed.load(
    (state) => failure.push(state),
    async () => {
      throw new Error('404 fixture');
    },
  );
  assert.deepEqual(failure, ['loading', 'failed']);
  assert.equal(failed.earth.material.map, null);
  assert.ok(failed.group.children.includes(failed.earth));
  failed.dispose();
});
test('one texture retry can recover and permanent failure is bounded', async () => {
  const layer = new EarthLayer(defaults);
  let calls = 0;
  const texture = new Texture();
  const states = [];
  await layer.load(
    (state) => states.push(state),
    async () => {
      if (++calls === 1) throw new Error('transient');
      return texture;
    },
  );
  assert.equal(calls, 2);
  assert.deepEqual(states, ['loading', 'ready']);
  layer.dispose();
  const failed = new EarthLayer(defaults);
  calls = 0;
  await failed.load(
    () => {},
    async () => {
      calls++;
      throw new Error('404');
    },
  );
  assert.equal(calls, 2);
  assert.equal(failed.earth.material.map, null);
  failed.dispose();
});

test('explicit retry after a settled failure shares in-flight work and then succeeds without replacing the scene', async () => {
  const earth = new EarthLayer(defaults),
    identity = earth.earth;
  let calls = 0;
  await earth.load(
    () => {},
    async () => {
      calls++;
      throw new Error('offline');
    },
  );
  assert.equal(calls, defaults.earth.textureRetries + 1);
  let resolve;
  const next = new Promise((r) => {
    resolve = r;
  });
  const texture = new Texture();
  const states = [];
  const first = earth.load(
    (s) => states.push(s),
    () => {
      calls++;
      return next;
    },
  );
  const second = earth.load(
    () => {},
    () => {
      throw new Error('must share');
    },
  );
  assert.equal(first, second);
  resolve(texture);
  await first;
  assert.deepEqual(states, ['loading', 'ready']);
  assert.equal(calls, defaults.earth.textureRetries + 2);
  assert.equal(earth.earth, identity);
  assert.equal(earth.earth.material.map, texture);
  earth.dispose();
});
test('explicit texture refresh releases the replaced texture once, preserves the current texture on failure and stays idempotent otherwise', async () => {
  const earth = new EarthLayer(defaults),
    first = new Texture(),
    second = new Texture();
  let firstDisposed = 0,
    secondDisposed = 0;
  first.addEventListener('dispose', () => firstDisposed++);
  second.addEventListener('dispose', () => secondDisposed++);
  await earth.load(
    () => {},
    async () => first,
  );
  await earth.load(
    () => {},
    async () => second,
    true,
  );
  assert.equal(firstDisposed, 1);
  assert.equal(earth.earth.material.map, second);
  await earth.load(
    () => {},
    async () => {
      throw new Error('refresh unavailable');
    },
    true,
  );
  assert.equal(earth.earth.material.map, second);
  assert.equal(secondDisposed, 0);
  let unwanted = 0;
  await earth.load(
    () => {},
    async () => {
      unwanted++;
      return new Texture();
    },
  );
  assert.equal(unwanted, 0);
  earth.dispose();
  earth.dispose();
  assert.equal(firstDisposed, 1);
  assert.equal(secondDisposed, 1);
});
test('disposal during a retry releases its late texture without updating the material or publishing ready', async () => {
  const earth = new EarthLayer(defaults);
  await earth.load(
    () => {},
    async () => {
      throw new Error('unavailable');
    },
  );
  let resolve;
  const waiting = new Promise((r) => (resolve = r)),
    texture = new Texture();
  let released = 0;
  texture.addEventListener('dispose', () => released++);
  const states = [],
    pending = earth.load(
      (s) => states.push(s),
      () => waiting,
    );
  await Promise.resolve();
  earth.dispose();
  resolve(texture);
  await pending;
  assert.equal(released, 1);
  assert.equal(earth.earth.material.map, null);
  assert.deepEqual(states, ['loading']);
});

test('loading notification cannot re-enter and start a second concurrent load', async () => {
  const earth = new EarthLayer(defaults);
  let calls = 0,
    nested;
  const loader = async () => {
    calls++;
    return new Texture();
  };
  const pending = earth.load((state) => {
    if (state === 'loading') nested = earth.load(() => {}, loader, true);
  }, loader);
  await pending;
  await nested;
  assert.equal(calls, 1);
  assert.equal(pending, nested);
  earth.dispose();
});
