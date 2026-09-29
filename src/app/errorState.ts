import type { AppError } from '../shared/index.ts';
import { monotonicNow } from '../shared/index.ts';
import type { AppStore } from './AppStore.ts';
export type ErrorRecord = Readonly<
  AppError & { occurrences?: number; lastAtMs?: number }
>;
export function mergeError(
  errors: readonly ErrorRecord[],
  incoming: Readonly<AppError>,
  atMs: number,
  windowMs: number,
  capacity: number,
): readonly ErrorRecord[] {
  const same = (e: ErrorRecord) =>
    e.code === incoming.code && e.sessionId === incoming.sessionId;
  const previous = errors.find(same);
  const repeated =
    previous && atMs - (previous.lastAtMs ?? previous.atMs) <= windowMs;
  const value = {
    ...incoming,
    occurrences: repeated ? (previous.occurrences ?? 1) + 1 : 1,
    lastAtMs: atMs,
  };
  const all = [...errors.filter((e) => !same(e)), value];
  const fatal = all.filter((e) => e.severity === 'FATAL').slice(-capacity);
  const remaining = capacity - fatal.length;
  return [
    ...fatal,
    ...(remaining
      ? all.filter((e) => e.severity !== 'FATAL').slice(-remaining)
      : []),
  ];
}
let sequence = 0;
export function raiseAppError(
  store: AppStore | undefined,
  code: AppError['code'],
  module: AppError['module'],
  severity: AppError['severity'] = 'ERROR',
  retryPolicy: AppError['retryPolicy'] = 'USER',
  sessionId?: string,
) {
  if (!store) return;
  const atMs = monotonicNow();
  store.dispatch({
    type: 'ERROR_RAISED',
    atMs,
    error: {
      schemaVersion: 1,
      id: `app-error-${++sequence}`,
      code,
      module,
      severity,
      retryPolicy,
      recoverable: severity !== 'FATAL',
      messageKey: code,
      atMs,
      ...(sessionId ? { sessionId } : {}),
    },
  });
}
export function resolveAppErrors(store: AppStore, prefix: string) {
  for (const error of store.getState().errors)
    if (error.code.startsWith(prefix))
      store.dispatch({
        type: 'ERROR_RESOLVED',
        atMs: monotonicNow(),
        code: error.code,
      });
}
