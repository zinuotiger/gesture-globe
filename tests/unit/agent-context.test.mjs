import assert from 'node:assert/strict';
import { test } from 'vitest';
import { AgentContextBuilder } from '../../src/agent/index.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';

const input = () => ({
  view: {
    schemaVersion: 1,
    azimuth: 0,
    polar: 1,
    distance: 3,
    target: { x: 0, y: 0, z: 0 },
    autoRotate: false,
    transition: 'IDLE',
  },
  selection: {
    latitude: 39.9,
    longitude: 116.4,
    selectionId: 'private-id',
    nearestCity: { name: 'not copied' },
  },
  availableTools: ['resetView'],
});
test('context copies only allowed scalar fields; hostile extra fields are never read', () => {
  const source = input();
  const forbidden = [
    'frame',
    'landmarks',
    'deviceId',
    'sessionId',
    'audio',
    'renderer',
    'token',
  ];
  for (const object of [
    source,
    source.view,
    source.view.target,
    source.selection,
    source.availableTools,
  ])
    for (const key of forbidden)
      Object.defineProperty(object, key, {
        get() {
          throw new Error('private getter was read');
        },
        enumerable: true,
      });
  const context = new AgentContextBuilder(
    parseConfig({ features: { agent: true } }),
  ).build(source);
  assert.deepEqual(context.selection, { latitude: 39.9, longitude: 116.4 });
  assert.deepEqual(context.versions, {
    schema: 1,
    config: defaults.configVersion,
  });
  assert.deepEqual(context.capabilities, { agent: true, tools: ['resetView'] });
  const serialized = JSON.stringify(context);
  for (const key of [...forbidden, 'private-id', 'nearestCity'])
    assert.equal(serialized.includes(key), false);
  source.view.distance = 4;
  assert.equal(context.view.distance, 3);
  assert.ok(Object.isFrozen(context.view.target));
  assert.ok(Object.isFrozen(context.capabilities.tools));
});
test('context defaults disabled and rejects malformed required data without getter execution', () => {
  const source = input();
  source.selection = null;
  assert.deepEqual(new AgentContextBuilder().build(source).capabilities, {
    agent: false,
    tools: [],
  });
  for (const mutate of [
    (value) => {
      value.view.distance = NaN;
    },
    (value) => {
      value.view.target.x = 1;
    },
    (value) => {
      value.view.schemaVersion = 2;
    },
    (value) => {
      value.view.transition = 'unknown';
    },
    (value) => {
      value.selection.latitude = 91;
    },
    (value) => {
      value.availableTools = ['eval'];
    },
    (value) => {
      value.availableTools = ['resetView', 'resetView'];
    },
    (value) => {
      Object.defineProperty(value.view, 'distance', {
        get() {
          throw new Error('must not execute');
        },
      });
    },
  ]) {
    const invalid = input();
    mutate(invalid);
    assert.throws(() => new AgentContextBuilder().build(invalid), TypeError);
  }
});
