import { test, expect } from 'vitest';
import { mergeError } from '../../src/app/errorState.ts';
import { AppStore } from '../../src/app/index.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';
import { errorCopy } from '../../src/ui/index.ts';
const error = (code = 'E-CAM-001', sessionId = 'one') => ({
  schemaVersion: 1,
  id: 'error',
  code,
  module: 'M03',
  severity: 'ERROR',
  recoverable: true,
  retryPolicy: 'USER',
  messageKey: 'untrusted <script> private stack',
  atMs: 0,
  sessionId,
  technical: { detail: 'private-path' },
});
test('deduplicates code+session in 3s, resets count outside window, caps queue and retains FATAL', () => {
  let errors = mergeError([], error(), 0, 3000, 3);
  errors = mergeError(errors, error(), 2999, 3000, 3);
  expect(errors).toHaveLength(1);
  expect(errors[0].occurrences).toBe(2);
  errors = mergeError(errors, error(), 6000, 3000, 3);
  expect(errors[0].occurrences).toBe(1);
  errors = mergeError(errors, error('E-CAM-001', 'two'), 6001, 3000, 3);
  expect(errors).toHaveLength(2);
  errors = mergeError(
    errors,
    { ...error('E-GLB-002'), severity: 'FATAL' },
    6002,
    3000,
    3,
  );
  for (let i = 0; i < 20; i++)
    errors = mergeError(
      errors,
      error('E-CAM-003', String(i)),
      6003 + i,
      3000,
      3,
    );
  expect(errors).toHaveLength(3);
  expect(errors.some((e) => e.severity === 'FATAL')).toBe(true);
});
test('all camera/model/globe/city errors explain event, impact and next step without private exception text', () => {
  for (const code of [
    'E-CAM-001',
    'E-CAM-002',
    'E-CAM-003',
    'E-CAM-004',
    'E-CAM-005',
    'E-CAM-006',
    'E-CAM-007',
    'E-CAP-001',
    'E-VIS-001',
    'E-VIS-002',
    'E-VIS-003',
    'E-VIS-004',
    'E-VIS-006',
    'E-GLB-001',
    'E-GLB-002',
    'E-GEO-001',
    'E-APP-STATE-001',
  ]) {
    const copy = errorCopy(error(code));
    for (const key of ['title', 'impact', 'next'])
      expect(copy[key].length).toBeGreaterThan(4);
    expect(JSON.stringify(copy)).not.toMatch(/private|script|stack/);
  }
  expect(errorCopy(error()).mouse).toBe(true);
  expect(errorCopy(error('E-VIS-006')).action).toBe('RELOAD_APP');
});
test('AppStore records repeated failures, resolves explicitly and cannot recover a FATAL via a late bootstrap', () => {
  const store = new AppStore(defaults);
  store.dispatch({ type: 'ERROR_RAISED', atMs: 1, error: error() });
  store.dispatch({ type: 'ERROR_RAISED', atMs: 2, error: error() });
  expect(store.getState().errors[0].occurrences).toBe(2);
  store.dispatch({ type: 'ERROR_RESOLVED', atMs: 3, code: 'E-CAM-001' });
  expect(store.getState().errors).toHaveLength(0);
  store.dispatch({
    type: 'ERROR_RAISED',
    atMs: 4,
    error: { ...error('E-GLB-002'), severity: 'FATAL' },
  });
  store.dispatch({ type: 'APP_BOOTSTRAPPED', atMs: 5, available: true });
  expect(store.getState().appPhase).toBe('FATAL');
  expect(() => parseConfig({ ui: { errorCapacity: 0 } })).toThrow();
});
