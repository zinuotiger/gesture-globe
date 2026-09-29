export {
  detectCameraCapability,
  browserCameraEnvironment,
} from './CapabilityDetector.ts';
export type {
  CameraEnvironment,
  CameraCapability,
} from './CapabilityDetector.ts';
export {
  PermissionController,
  browserPermissionPlatform,
  releaseCameraStream,
} from './PermissionController.ts';
export type { PermissionPlatform } from './PermissionController.ts';
export { mapCameraError, cancelledCamera } from './CameraErrorMapper.ts';
export type { CameraFailure } from './CameraErrorMapper.ts';
export { StreamController } from './StreamController.ts';
export type {
  CameraState,
  CameraPhase,
  CameraPermission,
} from './StreamController.ts';
export { VideoSource } from './VideoSource.ts';
export {
  CoordinateAdapter,
  computeObjectFitRect,
} from './coordinates/CoordinateAdapter.ts';
export type {
  Size,
  Point,
  Rect,
  ObjectFit,
} from './coordinates/CoordinateAdapter.ts';
