export interface CameraEnvironment {
  secure: boolean;
  mediaAvailable: boolean;
  pageActive: boolean;
}
export type CameraCapability =
  | Readonly<{ available: true }>
  | Readonly<{
      available: false;
      reason: 'INSECURE' | 'UNSUPPORTED' | 'INACTIVE';
      message: string;
    }>;
export function detectCameraCapability(
  environment: CameraEnvironment,
): CameraCapability {
  if (!environment.secure)
    return {
      available: false,
      reason: 'INSECURE',
      message: '摄像头需要 HTTPS 或本机 localhost 安全环境。',
    };
  if (!environment.mediaAvailable)
    return {
      available: false,
      reason: 'UNSUPPORTED',
      message: '当前浏览器不支持摄像头访问，可继续使用鼠标控制。',
    };
  if (!environment.pageActive)
    return {
      available: false,
      reason: 'INACTIVE',
      message: '请切回此页面，再主动启用摄像头。',
    };
  return { available: true };
}
export function browserCameraEnvironment(): CameraEnvironment {
  return {
    secure: window.isSecureContext,
    mediaAvailable: typeof navigator.mediaDevices?.getUserMedia === 'function',
    pageActive:
      document.visibilityState === 'visible' &&
      !('prerendering' in document && document.prerendering),
  };
}
