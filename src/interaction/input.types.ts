import type {
  InputIntent,
  InputSource,
  IntentPhase,
  GeoCoordinate,
} from '../shared/index.ts';
export type ControlKind =
  | 'ROTATE'
  | 'ZOOM'
  | 'SELECT'
  | 'SELECT_GEO'
  | 'DRAW_ROUTE'
  | 'PAUSE'
  | 'RESET'
  | 'FOCUS'
  | 'SET_AUTOROTATE'
  | 'CANCEL';
export interface ControlPayload {
  points?: readonly GeoCoordinate[];
  yaw?: number;
  pitch?: number;
  dt?: number;
  delta?: number;
  pointer?: Readonly<{ x: number; y: number }>;
  lat?: number;
  lon?: number;
  distance?: number;
  enabled?: boolean;
  sessionId?: string;
  sourceHandId?: string;
  confidence?: number;
}
export type ControlInputIntent = InputIntent<Readonly<ControlPayload>> & {
  kind: ControlKind;
};
export type DispatchResult = Readonly<{
  accepted: boolean;
  reason:
    | 'ACCEPTED'
    | 'INVALID_INPUT'
    | 'HANDLER_FAILED'
    | 'DISPOSED'
    | 'SOURCE_LOCKED'
    | 'DUPLICATE'
    | 'EXECUTION_REJECTED';
}>;
export interface InputPort {
  dispatch(value: unknown): DispatchResult;
}
export interface InputAdapter {
  readonly source: InputSource;
  send(
    kind: ControlKind,
    phase: IntentPhase,
    payload: ControlPayload,
    traceId?: string,
  ): DispatchResult;
}
