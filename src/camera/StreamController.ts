import type { AppConfig } from '../config/index.ts';
import type { Result } from '../shared/index.ts';
import {
  PermissionController,
  releaseCameraStream,
} from './PermissionController.ts';
import { cancelledCamera, mapCameraError } from './CameraErrorMapper.ts';
import type { CameraFailure } from './CameraErrorMapper.ts';

export type CameraPhase =
  'OFF' | 'REQUESTING' | 'WAITING' | 'ACTIVE' | 'MUTED' | 'ERROR';
export interface CameraState {
  phase: CameraPhase;
  error: CameraFailure | undefined;
}
export interface CameraPermission {
  request(
    signal: AbortSignal,
    onWaiting?: () => void,
  ): Promise<Result<MediaStream, CameraFailure>>;
}
export class StreamController {
  private stream: MediaStream | undefined;
  private pending: Promise<Result<void, CameraFailure>> | undefined;
  private abort: AbortController | undefined;
  private generation = 0;
  private disposed = false;
  private state: Readonly<CameraState> = Object.freeze({
    phase: 'OFF',
    error: undefined,
  });
  private listeners = new Set<(state: Readonly<CameraState>) => void>();
  private removeTrackListeners: (() => void)[] = [];
  constructor(
    config: Readonly<AppConfig>,
    private readonly permission: CameraPermission = new PermissionController(
      config,
    ),
    private readonly now: () => number = () => performance.now(),
  ) {}
  getState(): Readonly<CameraState> {
    return this.state;
  }
  getStream(): MediaStream | undefined {
    return this.stream;
  }
  subscribe(listener: (state: Readonly<CameraState>) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish(phase: CameraPhase, error?: CameraFailure): void {
    this.state = Object.freeze({ phase, error });
    for (const listener of this.listeners) listener(this.state);
  }
  start(): Promise<Result<void, CameraFailure>> {
    if (this.disposed)
      return Promise.resolve({ ok: false, error: cancelledCamera(this.now()) });
    if (this.stream) return Promise.resolve({ ok: true, value: undefined });
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    const abort = new AbortController();
    this.abort = abort;
    this.publish('REQUESTING');
    const run = async (): Promise<Result<void, CameraFailure>> => {
      try {
        const result = await this.permission.request(abort.signal, () => {
          if (generation === this.generation) this.publish('WAITING');
        });
        if (
          generation !== this.generation ||
          this.disposed ||
          abort.signal.aborted
        ) {
          if (result.ok) releaseCameraStream(result.value);
          return { ok: false, error: cancelledCamera(this.now()) };
        }
        if (!result.ok) {
          this.publish(
            result.error.reason === 'Cancelled' ? 'OFF' : 'ERROR',
            result.error,
          );
          return result;
        }
        const stream = result.value;
        if (
          stream.getAudioTracks().length ||
          !stream.getVideoTracks().length ||
          stream.getVideoTracks().some((track) => track.readyState !== 'live')
        ) {
          releaseCameraStream(stream);
          const error = mapCameraError(
            { name: 'NotReadableError' },
            this.now(),
          );
          this.publish('ERROR', error);
          return { ok: false, error };
        }
        this.stream = stream;
        const ended = () => {
          if (this.stream !== stream) return;
          const error: CameraFailure = {
            ...mapCameraError({ name: 'NotReadableError' }, this.now()),
            code: 'E-CAM-006',
            reason: 'TrackEnded',
            messageKey: 'camera.ended',
            guidance: '摄像头连接已中断。请检查设备后主动重新启用。',
          };
          this.stop();
          this.publish('ERROR', error);
        };
        const muted = () => {
          if (this.stream === stream)
            this.publish(
              stream.getVideoTracks().some((track) => track.muted)
                ? 'MUTED'
                : 'ACTIVE',
            );
        };
        for (const track of stream.getTracks()) {
          track.addEventListener('ended', ended);
          track.addEventListener('mute', muted);
          track.addEventListener('unmute', muted);
          this.removeTrackListeners.push(() => {
            track.removeEventListener('ended', ended);
            track.removeEventListener('mute', muted);
            track.removeEventListener('unmute', muted);
          });
        }
        muted();
        return { ok: true, value: undefined };
      } catch (error) {
        const failure = mapCameraError(error, this.now());
        if (generation === this.generation) {
          this.stop();
          this.publish('ERROR', failure);
        }
        return { ok: false, error: failure };
      } finally {
        if (generation === this.generation) {
          this.pending = undefined;
          this.abort = undefined;
        }
      }
    };
    this.pending = run();
    return this.pending;
  }
  stop(): void {
    ++this.generation;
    this.abort?.abort();
    this.abort = undefined;
    this.pending = undefined;
    for (const remove of this.removeTrackListeners) remove();
    this.removeTrackListeners = [];
    const stream = this.stream;
    this.stream = undefined;
    if (stream) releaseCameraStream(stream);
    this.publish('OFF');
  }
  fail(error: CameraFailure): void {
    this.stop();
    if (!this.disposed) this.publish('ERROR', error);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.listeners.clear();
  }
}
