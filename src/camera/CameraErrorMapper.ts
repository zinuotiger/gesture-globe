import type { AppError } from '../shared/index.ts';

export type CameraFailure = AppError & { reason: string; guidance: string };
const known = {
  NotAllowedError: [
    'E-CAM-001',
    'permission',
    '请在浏览器或系统设置中允许摄像头，再主动重试。',
    'USER',
  ],
  NotFoundError: ['E-CAM-002', 'missing', '请连接摄像头后重试。', 'USER'],
  NotReadableError: [
    'E-CAM-003',
    'busy',
    '请关闭其他占用摄像头的程序后重试。',
    'USER',
  ],
  OverconstrainedError: [
    'E-CAM-004',
    'constraints',
    '将降低视频要求重试一次；仍失败可使用鼠标。',
    'AUTO_ONCE',
  ],
  AbortError: [
    'E-CAM-003',
    'aborted',
    '摄像头请求被中断，请准备好后主动重试。',
    'USER',
  ],
  InvalidStateError: [
    'E-CAM-003',
    'inactive',
    '请切回有效页面并重新启用摄像头。',
    'USER',
  ],
} as const;
let sequence = 0;
export function mapCameraError(error: unknown, atMs: number): CameraFailure {
  const name =
    error &&
    typeof error === 'object' &&
    'name' in error &&
    typeof error.name === 'string' &&
    Object.hasOwn(known, error.name)
      ? (error.name as keyof typeof known)
      : 'UnknownError';
  const item =
    name === 'UnknownError'
      ? ([
          'E-CAM-003',
          'unknown',
          '摄像头无法启动，可继续使用鼠标并稍后主动重试。',
          'USER',
        ] as const)
      : known[name];
  return {
    schemaVersion: 1,
    id: `camera-error-${++sequence}`,
    code: item[0],
    module: 'M03',
    severity: name === 'OverconstrainedError' ? 'WARNING' : 'ERROR',
    recoverable: true,
    retryPolicy: item[3],
    messageKey: `camera.${item[1]}`,
    atMs,
    technical: { name },
    reason: name,
    guidance: item[2],
  };
}
export function cancelledCamera(atMs: number): CameraFailure {
  return {
    ...mapCameraError({ name: 'AbortError' }, atMs),
    severity: 'INFO',
    retryPolicy: 'NONE',
    messageKey: 'camera.cancelled',
    reason: 'Cancelled',
    guidance: '已取消。摄像头保持关闭，可再次主动启用。',
  };
}
