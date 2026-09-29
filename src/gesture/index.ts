export { extractFeatures } from './features/extractFeatures.ts';
export { PrimaryHandSelector } from './PrimaryHandSelector.ts';
export { GestureStateMachine } from './GestureStateMachine.ts';
export { GestureEngine, rotateDelta } from './GestureEngine.ts';
export type { GestureDebugState } from './GestureEngine.ts';
export { mapTransition } from './IntentMapper.ts';
export type { IntentContext } from './IntentMapper.ts';
export { pinchConditions, zoomDelta } from './PinchZoom.ts';
export type {
  GesturePhase,
  GestureRule,
  GestureStep,
  GestureTransition,
} from './GestureStateMachine.ts';
export { TemporalFilter, ema, applyDeadzone } from './TemporalFilter.ts';
export type {
  TemporalInput,
  FilteredHand,
  AnchorResetReason,
} from './TemporalFilter.ts';
export type { SelectedHand } from './PrimaryHandSelector.ts';
export type {
  HandFeatures,
  FeatureSample,
} from './features/extractFeatures.ts';
