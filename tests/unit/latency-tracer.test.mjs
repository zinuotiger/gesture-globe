import { test, expect } from 'vitest';
import { LatencyTracer } from '../../src/diagnostics/index.ts';
const create = () => new LatencyTracer({ capacity: 3, windowMs: 1000 });
const timing = (captureMs = 100, kind = 'ROTATE') => ({
  kind,
  captureMs,
  resultMs: captureMs + 10,
  intentMs: captureMs + 12,
});
function submit(
  t,
  id = 'input-1',
  trace = 'trace-1',
  capture = 100,
  kind = 'ROTATE',
) {
  expect(t.recordIntent(id, timing(capture, kind))).toBe(true);
  expect(t.associate(id, trace)).toBe(true);
}
test('ordered stages use next render submission, with explicit unknown before completion', () => {
  const t = create();
  submit(t);
  expect(t.command('trace-1', 'CANCEL_TRANSITION', 113)).toBe(false);
  expect(t.command('trace-1', 'ROTATE', 115)).toBe(true);
  expect(t.snapshot(115).captureToRender.count).toBe(0);
  expect(t.rendered(114)).toBe(0);
  expect(t.rendered(120)).toBe(1);
  const s = t.snapshot(120);
  expect(s.method).toBe('NEXT_RENDER_SUBMISSION');
  expect(s.captureToResult.latest).toBe(10);
  expect(s.resultToIntent.latest).toBe(2);
  expect(s.intentToCommand.latest).toBe(3);
  expect(s.commandToRender.latest).toBe(5);
  expect(s.captureToRender.latest).toBe(20);
  expect(t.rendered(121)).toBe(0);
});
test('coalescing retains earliest age and keeps only first command before render; reset matches RESET_VIEW', () => {
  const t = create();
  submit(t);
  submit(t, 'input-2', 'trace-1', 101);
  t.command('trace-1', 'ROTATE', 115);
  submit(t, 'input-3', 'trace-1', 103);
  t.command('trace-1', 'ROTATE', 116);
  expect(t.rendered(120)).toBe(1);
  expect(t.snapshot(120).last.captureMs).toBe(100);
  submit(t, 'reset-1', 'reset-trace', 200, 'RESET');
  expect(t.command('reset-trace', 'RESET', 215)).toBe(false);
  expect(t.command('reset-trace', 'RESET_VIEW', 215)).toBe(true);
  t.rendered(220);
  expect(t.snapshot(220).last.traceId).toBe('reset-trace');
});
test('invalid clocks, IDs, DTO accessors and ordering cannot create samples', () => {
  const t = create();
  for (const value of [
    { ...timing(), resultMs: 99 },
    { ...timing(), intentMs: NaN },
    { ...timing(), captureMs: -1 },
    { ...timing(), intentMs: Infinity },
  ])
    expect(t.recordIntent('id', value)).toBe(false);
  expect(t.recordIntent('../path', timing())).toBe(false);
  expect(
    t.recordIntent(
      'id',
      Object.defineProperty({}, 'kind', {
        get() {
          throw Error('must not read');
        },
      }),
    ),
  ).toBe(false);
  submit(t);
  t.command('trace-1', 'ROTATE', 115);
  t.rendered(120);
  submit(t, 'id-2', 'trace-2', 100);
  t.command('trace-2', 'ROTATE', 115);
  expect(t.rendered(119)).toBe(0);
  expect(t.rendered(Infinity)).toBe(0);
  expect(t.snapshot(120).captureToRender.count).toBe(1);
});
test('capacity, expiration, cancellation, pause and disposal bound scalar-only retention', () => {
  const t = create();
  for (let i = 0; i < 100; i++) t.recordIntent(`input-${i}`, timing(i));
  expect(t.snapshot(111).pending).toBe(3);
  expect(t.associate('input-0', 'old')).toBe(false);
  expect(t.snapshot(1112).pending).toBe(0);
  submit(t);
  t.command('trace-1', 'ROTATE', 115);
  t.cancel('trace-1');
  expect(t.rendered(120)).toBe(0);
  submit(t);
  t.command('trace-1', 'ROTATE', 115);
  t.rendered(121);
  expect(JSON.stringify(t.snapshot(121))).not.toMatch(
    /landmark|bitmap|frameId|deviceId/,
  );
  expect(t.snapshot(1122).last).toBeNull();
  t.pause();
  expect(t.snapshot(1122).captureToRender.count).toBe(0);
  t.dispose();
  expect(t.recordIntent('new', timing())).toBe(false);
  expect(t.rendered(1200)).toBe(0);
});
