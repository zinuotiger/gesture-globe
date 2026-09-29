import { test, expect } from 'vitest';
import {
  OnboardingPreference,
  onboardingKey,
} from '../../src/app/OnboardingPreference.ts';
import { AppStore } from '../../src/app/index.ts';
import { preparationText } from '../../src/ui/index.ts';
import { defaults } from '../../src/config/index.ts';
test('tutorial completion is minimal, versioned, resettable and rejects malformed storage', () => {
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    };
  const p = new OnboardingPreference(storage);
  expect(p.isComplete()).toBe(false);
  p.complete();
  expect(JSON.parse(values.get(onboardingKey))).toEqual({
    schemaVersion: 1,
    completed: true,
  });
  expect(new OnboardingPreference(storage).isComplete()).toBe(true);
  p.reset();
  expect(values.size).toBe(0);
  expect(p.isComplete()).toBe(false);
  for (const value of [
    'invalid',
    '{"schemaVersion":2,"completed":true}',
    '{"schemaVersion":1,"completed":"true"}',
  ]) {
    values.set(onboardingKey, value);
    expect(new OnboardingPreference(storage).isComplete()).toBe(false);
  }
});
test('blocked storage allows session completion without throwing', () => {
  const fail = () => {
    throw new Error('blocked');
  };
  const p = new OnboardingPreference({
    getItem: fail,
    setItem: fail,
    removeItem: fail,
  });
  expect(p.isComplete()).toBe(false);
  p.complete();
  expect(p.isComplete()).toBe(true);
  p.reset();
  expect(p.isComplete()).toBe(false);
});
test('preparation distinguishes permission, model failure and unready or absent hands', () => {
  const s = new AppStore(defaults).getState();
  expect(preparationText(s)).toContain('未开启');
  expect(preparationText({ ...s, cameraStatus: 'REQUESTING' })).toContain(
    '等待浏览器授权',
  );
  expect(
    preparationText({ ...s, cameraStatus: 'STREAMING', visionStatus: 'ERROR' }),
  ).toContain('关闭摄像头后重试');
  expect(
    preparationText({
      ...s,
      cameraStatus: 'STREAMING',
      visionStatus: 'READY',
      handStatus: 'UNREADY',
    }),
  ).toContain('调整与摄像头的距离');
  expect(
    preparationText({
      ...s,
      cameraStatus: 'STREAMING',
      visionStatus: 'READY',
      handStatus: 'NO_HAND',
    }),
  ).toContain('整只手');
  expect(
    preparationText({
      ...s,
      cameraStatus: 'STREAMING',
      visionStatus: 'READY',
      handStatus: 'READY',
    }),
  ).toContain('手部位置可用于控制');
});
