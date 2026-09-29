import assert from 'node:assert/strict';
import { test } from 'vitest';
import { assertEventEnvelope } from '../../src/shared/index.ts';

test('CT-EVT-001 rejects unsupported wire version after serialization', () => {
  const envelope = JSON.parse(
    '{"schemaVersion":2,"eventId":"e","type":"READY","atMs":0,"source":"M04","payload":{}}',
  );
  assert.throws(() => assertEventEnvelope(envelope), /schemaVersion/);
});
