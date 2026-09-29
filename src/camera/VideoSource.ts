import type { AppConfig } from '../config/index.ts';
import type { Result } from '../shared/index.ts';
import { browserPermissionPlatform } from './PermissionController.ts';
import type { PermissionPlatform } from './PermissionController.ts';
import { cancelledCamera, mapCameraError } from './CameraErrorMapper.ts';
import type { CameraFailure } from './CameraErrorMapper.ts';

type VideoClock = Pick<PermissionPlatform, 'setTimer' | 'clearTimer' | 'now'>;
export class VideoSource {
  private stream: MediaStream | undefined;
  private cancelWait: (() => void) | undefined;
  private disposed = false;
  constructor(
    private readonly video: HTMLVideoElement,
    private readonly config: Readonly<AppConfig>,
    private readonly clock: VideoClock = browserPermissionPlatform,
  ) {
    video.muted = true;
    video.playsInline = true;
  }
  isReady(): boolean {
    return (
      !this.disposed &&
      !!this.stream &&
      this.video.srcObject === this.stream &&
      this.video.readyState >= 2 &&
      this.video.videoWidth > 0 &&
      this.video.videoHeight > 0 &&
      Number.isFinite(this.video.videoWidth) &&
      Number.isFinite(this.video.videoHeight) &&
      !this.video.paused &&
      !this.video.ended &&
      this.stream
        .getVideoTracks()
        .some((track) => track.readyState === 'live' && !track.muted)
    );
  }
  getFrameSource(): HTMLVideoElement | undefined {
    return this.isReady() ? this.video : undefined;
  }
  bind(stream: MediaStream): Promise<Result<void, CameraFailure>> {
    this.unbind();
    if (this.disposed)
      return Promise.resolve({
        ok: false,
        error: cancelledCamera(this.clock.now()),
      });
    this.stream = stream;
    this.video.srcObject = stream;
    return new Promise((resolve) => {
      let settled = false;
      const events = [
        'loadedmetadata',
        'loadeddata',
        'canplay',
        'resize',
        'playing',
      ];
      const failure = (): CameraFailure => ({
        ...mapCameraError({ name: 'InvalidStateError' }, this.clock.now()),
        code: 'E-CAM-007',
        reason: 'VideoNotReady',
        messageKey: 'camera.videoNotReady',
        guidance: '视频未能准备就绪，摄像头已关闭。请检查设备后重试。',
      });
      const finish = (result: Result<void, CameraFailure>) => {
        if (settled) return;
        settled = true;
        this.clock.clearTimer(timer);
        for (const name of events) this.video.removeEventListener(name, check);
        this.video.removeEventListener('error', failed);
        this.cancelWait = undefined;
        if (!result.ok) {
          this.video.pause();
          this.video.srcObject = null;
          this.stream = undefined;
        }
        resolve(result);
      };
      const check = () => {
        if (this.isReady()) finish({ ok: true, value: undefined });
      };
      const failed = () => finish({ ok: false, error: failure() });
      const timer = this.clock.setTimer(
        failed,
        this.config.camera.videoReadyTimeoutMs,
      );
      this.cancelWait = () =>
        finish({ ok: false, error: cancelledCamera(this.clock.now()) });
      for (const name of events) this.video.addEventListener(name, check);
      this.video.addEventListener('error', failed);
      try {
        void this.video.play().then(check, failed);
      } catch {
        failed();
      }
    });
  }
  unbind(): void {
    this.cancelWait?.();
    this.cancelWait = undefined;
    this.video.pause();
    this.video.srcObject = null;
    this.stream = undefined;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unbind();
  }
}
