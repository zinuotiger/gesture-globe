import { assertGestureIntent } from '../shared/index.ts';
import type {
  GestureIntent,
  GestureIntentKind,
  Point2,
} from '../shared/index.ts';
import type { GestureTransition } from './GestureStateMachine.ts';

export interface IntentContext {
  readonly id: string;
  readonly sessionId: string;
  readonly sourceHandId: string;
  readonly kind: GestureIntentKind;
  readonly confidence: number;
  readonly delta?: Point2;
  readonly pointer?: Point2;
  readonly traceId?: string;
}

/** Pure mapping: caller owns identity/time; no DOM, clock, random IDs or retained payload. */
export function mapTransition(
  transition: GestureTransition,
  context: IntentContext,
): GestureIntent {
  const moving = transition.phase === 'START' || transition.phase === 'UPDATE';
  const intent = {
    schemaVersion: 1,
    id: context.id,
    sessionId: context.sessionId,
    source: 'gesture',
    sourceHandId: context.sourceHandId,
    kind: context.kind,
    phase: transition.phase,
    timestampMs: transition.atMs,
    confidence: context.confidence,
    ...(context.traceId !== undefined ? { traceId: context.traceId } : {}),
    ...(moving && (context.kind === 'ROTATE' || context.kind === 'ZOOM')
      ? {
          delta:
            transition.phase === 'START'
              ? { x: 0, y: 0 }
              : context.delta && { ...context.delta },
        }
      : {}),
    ...(moving && context.kind === 'SELECT'
      ? { pointer: context.pointer && { ...context.pointer } }
      : {}),
  };
  assertGestureIntent(intent);
  return intent;
}
