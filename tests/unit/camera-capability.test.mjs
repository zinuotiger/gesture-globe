import assert from 'node:assert/strict';
import { test } from 'vitest';
import { detectCameraCapability } from '../../src/camera/index.ts';
test('camera capability is side-effect-free and distinguishes safety, support and activity', () => {
  const ready = { secure: true, mediaAvailable: true, pageActive: true };
  assert.deepEqual(detectCameraCapability(ready), { available: true });
  for (const [key, reason] of [
    ['secure', 'INSECURE'],
    ['mediaAvailable', 'UNSUPPORTED'],
    ['pageActive', 'INACTIVE'],
  ]) {
    const result = detectCameraCapability({ ...ready, [key]: false });
    assert.equal(result.available, false);
    assert.equal(result.reason, reason);
    assert.ok(result.message);
  }
  assert.equal(
    detectCameraCapability({
      secure: false,
      mediaAvailable: false,
      pageActive: false,
    }).reason,
    'INSECURE',
  );
});
