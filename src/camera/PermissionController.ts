import type { AppConfig } from '../config/index.ts';
import type { Result } from '../shared/index.ts';
import {
  browserCameraEnvironment,
  detectCameraCapability,
} from './CapabilityDetector.ts';
import type { CameraEnvironment } from './CapabilityDetector.ts';
import { cancelledCamera, mapCameraError } from './CameraErrorMapper.ts';
import type { CameraFailure } from './CameraErrorMapper.ts';

export interface PermissionPlatform {
  environment(): CameraEnvironment;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  setTimer(callback: () => void, delayMs: number): number;
  clearTimer(id: number): void;
  now(): number;
}
export const browserPermissionPlatform: PermissionPlatform = {
  environment: browserCameraEnvironment,
  getUserMedia: (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (id) => window.clearTimeout(id),
  now: () => performance.now(),
};
export function releaseCameraStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
/** Called only by an explicit activation action. Cancellation is logical:
 * a late browser grant is stopped immediately and can never become active. */
export class PermissionController {
  constructor(
    private readonly config: Readonly<AppConfig>,
    private readonly platform: PermissionPlatform = browserPermissionPlatform,
  ) {}
  request(
    signal: AbortSignal,
    onWaiting: () => void = () => {},
  ): Promise<Result<MediaStream, CameraFailure>> {
    const p = this.platform;
    if (signal.aborted)
      return Promise.resolve({ ok: false, error: cancelledCamera(p.now()) });
    const capability = detectCameraCapability(p.environment());
    if (!capability.available) {
      const error = mapCameraError({ name: 'InvalidStateError' }, p.now());
      return Promise.resolve({
        ok: false,
        error: {
          ...error,
          code: capability.reason === 'INSECURE' ? 'E-CAP-001' : 'E-CAP-002',
          module: 'M01',
          reason: capability.reason,
          guidance: capability.message,
          retryPolicy: 'NONE',
        },
      });
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: Result<MediaStream, CameraFailure>) => {
        if (settled) {
          if (result.ok) releaseCameraStream(result.value);
          return;
        }
        settled = true;
        p.clearTimer(timer);
        signal.removeEventListener('abort', cancel);
        resolve(result);
      };
      const cancel = () =>
        finish({ ok: false, error: cancelledCamera(p.now()) });
      signal.addEventListener('abort', cancel, { once: true });
      const timer = p.setTimer(() => {
        if (!settled) onWaiting();
      }, this.config.camera.permissionTimeoutMs);
      const acquire = async () => {
        const video = {
          width: { ideal: this.config.camera.widthIdeal },
          height: { ideal: this.config.camera.heightIdeal },
          frameRate: { ideal: this.config.camera.frameRateIdeal },
        };
        try {
          const stream = await p.getUserMedia({ audio: false, video });
          finish({ ok: true, value: stream });
        } catch (error) {
          if (settled) return;
          const mapped = mapCameraError(error, p.now());
          if (mapped.reason === 'OverconstrainedError') {
            try {
              const stream = await p.getUserMedia({
                audio: false,
                video: true,
              });
              finish({ ok: true, value: stream });
            } catch (retryError) {
              finish({
                ok: false,
                error: {
                  ...mapCameraError(retryError, p.now()),
                  retryPolicy: 'USER',
                },
              });
            }
          } else finish({ ok: false, error: mapped });
        }
      };
      void acquire();
    });
  }
}
