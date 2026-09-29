import type { AppConfig } from '../config/index.ts';
import type { CommandBus } from '../interaction/index.ts';
import {
  VisionWorkerClient,
  VisionHealthMonitor,
  FrameScheduler,
  type FrameSource,
} from '../vision/index.ts';
import { monotonicNow, type VisionFrame } from '../shared/index.ts';
import { GesturePipeline } from './GesturePipeline.ts';
import type { Preferences } from './Preferences.ts';
import type { IntentTiming } from '../diagnostics/index.ts';

export interface GestureRuntimeState {
  sessionId: string | null;
  operationId: string | null;
  hand: 'UNKNOWN' | 'NO_HAND' | 'UNREADY' | 'READY';
  gesturePhase:
    'IDLE' | 'CANDIDATE' | 'ACTIVE' | 'RELEASING' | 'PAUSED' | 'COOLDOWN';
  confidence: number;
  candidate: string;
  phase: 'STOPPED' | 'INITIALIZING' | 'READY' | 'PAUSED' | 'DEGRADED';
  acceptedFrames: number;
  gesture: string;
  errorCode: string | null;
}
/** App owns lifecycle; real SDK inference stays behind the public Vision worker boundary. */
export class GestureRuntime {
  private readonly client: VisionWorkerClient;
  private readonly health: VisionHealthMonitor;
  private readonly scheduler: FrameScheduler;
  private readonly pipeline: GesturePipeline;
  private active = false;
  private paused = false;
  private disposed = false;
  private sessionSequence = 0;
  private activation = 0;
  private currentSession: string | null = null;
  private phase: GestureRuntimeState['phase'] = 'STOPPED';
  private errorCode: string | null = null;
  private removers: (() => void)[] = [];
  constructor(
    config: Readonly<AppConfig>,
    bus: CommandBus,
    private readonly source: FrameSource,
    private readonly onState: (state: Readonly<GestureRuntimeState>) => void,
    client = new VisionWorkerClient(config),
    now = monotonicNow,
    private readonly onFrame: (frame: VisionFrame | null) => void = () => {},
    observeIntent: (
      inputId: string,
      value: Readonly<IntentTiming>,
    ) => void = () => {},
  ) {
    this.client = client;
    this.pipeline = new GesturePipeline(config, bus, now, observeIntent);
    this.scheduler = new FrameScheduler(client, config, now);
    this.health = new VisionHealthMonitor(client, config, now);
    this.removers.push(
      client.onFrame((frame) => {
        if (!this.active || this.paused) return;
        const before = this.pipeline.getState().acceptedFrames;
        this.pipeline.accept(frame);
        this.onFrame(
          this.pipeline.getState().acceptedFrames > before ? frame : null,
        );
        this.publish();
      }),
    );
    this.removers.push(
      client.subscribe((state) => {
        if (!this.active) return;
        if (state.phase === 'READY' && state.sessionId && !this.paused) {
          this.pipeline.start(state.sessionId);
          this.scheduler.start(this.source);
          this.phase = 'READY';
          this.errorCode = null;
        } else if (state.phase !== 'READY') {
          this.scheduler.stop();
          this.pipeline.stop(state.phase);
          this.phase = this.paused ? 'PAUSED' : 'INITIALIZING';
        }
        this.publish();
      }),
    );
    this.removers.push(
      this.health.subscribe((state) => {
        if (state.phase === 'DEGRADED' && this.active) {
          this.phase = 'DEGRADED';
          this.errorCode = state.error?.code ?? 'E-VIS-003';
          this.scheduler.stop();
          this.pipeline.stop('DEGRADED');
          this.publish();
        }
      }),
    );
  }
  private publish() {
    if (this.phase !== 'READY') this.onFrame(null);
    this.onState(this.getState());
  }
  setPreferences(preferences: Readonly<Preferences>) {
    this.pipeline.setPreferences(preferences);
  }
  getState(): Readonly<GestureRuntimeState> {
    const state = this.pipeline.getState();
    return Object.freeze({
      sessionId: this.currentSession,
      operationId: this.active ? `gesture-operation-${this.activation}` : null,
      hand:
        this.phase !== 'READY' || state.frameId === null
          ? 'UNKNOWN'
          : !state.handPresent
            ? state.observedHands > 0
              ? 'UNREADY'
              : 'NO_HAND'
            : state.primaryHandId
              ? 'READY'
              : 'UNREADY',
      gesturePhase:
        this.phase !== 'READY' || state.phase === 'NO_HAND'
          ? 'IDLE'
          : state.phase,
      confidence: state.candidateScore,
      candidate: state.candidate,
      phase: this.phase,
      acceptedFrames: state.acceptedFrames,
      gesture: state.clutchPaused ? 'PAUSE' : state.activeGesture,
      errorCode: this.errorCode,
    });
  }
  async start(): Promise<void> {
    if (this.disposed || this.active) return;
    const activation = ++this.activation;
    this.currentSession = `gesture-session-${++this.sessionSequence}`;
    this.active = true;
    this.phase = this.paused ? 'PAUSED' : 'INITIALIZING';
    this.errorCode = null;
    this.publish();
    const result = await this.health.start({
      sessionId: this.currentSession,
    });
    if (!this.active || this.disposed || activation !== this.activation) return;
    if (!result.ok) {
      this.phase = 'DEGRADED';
      this.errorCode = result.error.code;
    }
    if (this.paused) this.health.pause('PAGE_HIDDEN_OR_MUTED');
    this.publish();
  }
  setPaused(value: boolean): void {
    if (this.disposed || this.paused === value) return;
    this.paused = value;
    if (!this.active) return;
    if (value) {
      this.health.pause('PAGE_HIDDEN_OR_MUTED');
      this.scheduler.stop();
      this.pipeline.stop('PAUSED');
      this.phase = 'PAUSED';
    } else {
      this.phase = 'INITIALIZING';
      this.health.resume();
      // A ready client may already be resumed; normally READY acknowledgement drives this.
      if (this.client.getState().phase === 'READY') {
        this.pipeline.start(this.client.getState().sessionId!);
        this.scheduler.start(this.source);
        this.phase = 'READY';
      }
    }
    this.publish();
  }
  tick(): void {
    if (this.active && !this.paused && !this.disposed) this.scheduler.tick();
  }
  stop(): void {
    if (this.disposed) return;
    this.activation++;
    this.active = false;
    this.currentSession = null;
    this.scheduler.stop();
    this.pipeline.stop();
    this.health.stop();
    this.phase = 'STOPPED';
    this.errorCode = null;
    this.publish();
  }
  getMetrics() {
    return {
      frames: this.scheduler.getMetrics(),
      inference: this.health.getMetrics(),
      dropped: this.client.getDropMetrics(),
      restarts: this.health.getState().restarts,
    };
  }
  setTargetHz(hz: number) {
    this.scheduler.setTargetHz(hz);
  }
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.removers.forEach((remove) => remove());
    this.removers = [];
    this.scheduler.dispose();
    this.health.dispose();
    this.client.dispose();
  }
}
