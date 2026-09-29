import assert from 'node:assert/strict';
import { test } from 'vitest';
import { defaults } from '../../src/config/index.ts';
import {
  PermissionController,
  mapCameraError,
} from '../../src/camera/index.ts';
function fixture(getUserMedia) {
  const timers = new Map();
  let id = 0;
  const platform = {
    environment: () => ({
      secure: true,
      mediaAvailable: true,
      pageActive: true,
    }),
    getUserMedia,
    setTimer: (fn, ms) => {
      assert.equal(ms, 20000);
      timers.set(++id, fn);
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    now: () => 100,
  };
  return {
    permission: new PermissionController(defaults, platform),
    timers,
    platform,
  };
}
test('all six browser errors have distinct reasons and recovery instructions without raw messages', () => {
  const names = [
    'NotAllowedError',
    'NotFoundError',
    'NotReadableError',
    'OverconstrainedError',
    'AbortError',
    'InvalidStateError',
  ];
  const mapped = names.map((name) =>
    mapCameraError({ name, message: 'private device detail' }, 10),
  );
  assert.equal(new Set(mapped.map((x) => x.messageKey)).size, 6);
  assert.deepEqual(
    mapped.map((x) => x.reason),
    names,
  );
  assert.equal(mapped[0].retryPolicy, 'USER');
  assert.equal(mapped[3].retryPolicy, 'AUTO_ONCE');
  assert.ok(
    mapped.every((x) => x.guidance && !JSON.stringify(x).includes('private')),
  );
  assert.equal(mapCameraError(new Error('unknown'), 10).reason, 'UnknownError');
});
test('ideal video/audio false; only overconstraint retries once with relaxed video', async () => {
  const constraints = [];
  const stream = { getTracks: () => [] };
  const f = fixture(async (value) => {
    constraints.push(value);
    if (constraints.length === 1) throw { name: 'OverconstrainedError' };
    return stream;
  });
  assert.deepEqual(
    await f.permission.request(new globalThis.AbortController().signal),
    {
      ok: true,
      value: stream,
    },
  );
  assert.deepEqual(constraints, [
    {
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    },
    { audio: false, video: true },
  ]);
  assert.equal(f.timers.size, 0);
  for (const name of [
    'NotAllowedError',
    'NotFoundError',
    'NotReadableError',
    'AbortError',
    'InvalidStateError',
    'OverconstrainedError',
  ]) {
    let count = 0;
    const fail = fixture(async () => {
      count++;
      throw { name };
    });
    const result = await fail.permission.request(
      new globalThis.AbortController().signal,
    );
    assert.equal(result.ok, false);
    assert.equal(count, name === 'OverconstrainedError' ? 2 : 1);
    assert.equal(result.error.retryPolicy, 'USER');
  }
});
test('pending permission announces waiting; cancel settles now and a late grant is released', async () => {
  let grant;
  let stopped = 0;
  let waiting = 0;
  const f = fixture(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  const abort = new globalThis.AbortController();
  const result = f.permission.request(abort.signal, () => waiting++);
  [...f.timers.values()][0]();
  assert.equal(waiting, 1);
  abort.abort();
  assert.equal((await result).error.reason, 'Cancelled');
  assert.equal(f.timers.size, 0);
  grant({
    getTracks: () => [
      {
        stop() {
          stopped++;
        },
      },
      {
        stop() {
          stopped++;
        },
      },
    ],
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(stopped, 2);
});
test('unsafe or pre-cancelled requests never touch getUserMedia', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    throw new Error('must not run');
  });
  f.platform.environment = () => ({
    secure: false,
    mediaAvailable: true,
    pageActive: true,
  });
  assert.equal(
    (await f.permission.request(new globalThis.AbortController().signal)).error
      .code,
    'E-CAP-001',
  );
  const abort = new globalThis.AbortController();
  abort.abort();
  assert.equal(
    (await f.permission.request(abort.signal)).error.reason,
    'Cancelled',
  );
  assert.equal(calls, 0);
});
