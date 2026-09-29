import { test } from 'vitest';
import assert from 'node:assert/strict';
import process from 'node:process';
import { Scene, REVISION } from 'three';
import { GestureRecognizer } from '@mediapipe/tasks-vision';
import { buildIdentity } from '../../scripts/quality-gate.mjs';

test('declared toolchain and required SDK versions match exact lock identities', async () => {
  const identity = await buildIdentity(process.cwd());
  assert.equal(identity.dependencies.three, '0.180.0');
  assert.equal(identity.dependencies['@mediapipe/tasks-vision'], '0.10.32');
  assert.match(identity.lockSha256, /^[a-f0-9]{64}$/);
  assert.match(identity.sourceHead, /^[a-f0-9]{40}$/);
});
test('required SDK public modules load without starting camera or inference', () => {
  assert.equal(REVISION, '180');
  assert.equal(new Scene().isScene, true);
  assert.equal(typeof GestureRecognizer.createFromOptions, 'function');
});
