import { geoToDirection } from '../shared/index.ts';
import type { GlobeCommand, ViewState } from '../shared/index.ts';
import type { AppConfig } from '../config/index.ts';
import { isGlobeCommand, type TransitionDriver } from './CommandExecutor.ts';
import type { CameraRig, RigView } from './CameraRig.ts';

interface Transition {
  kind: 'RESET' | 'FOCUS';
  from: RigView;
  to: Pick<RigView, 'azimuth' | 'polar' | 'distance'>;
  startedAt: number;
  duration: number;
  lastTime: number;
}
export class TransitionController implements TransitionDriver {
  private readonly rig: CameraRig;
  private readonly config: Readonly<AppConfig>;
  private active: Transition | undefined;
  private reducedMotion = false;
  constructor(rig: CameraRig, config: Readonly<AppConfig>) {
    this.rig = rig;
    this.config = config;
  }
  get kind(): ViewState['transition'] {
    return this.active?.kind ?? 'IDLE';
  }
  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    if (enabled) this.cancel();
  }
  start(
    command: Extract<GlobeCommand, { type: 'RESET_VIEW' | 'FOCUS_GEO' }>,
    nowMs: number,
  ): boolean {
    if (!isGlobeCommand(command) || !Number.isFinite(nowMs) || nowMs < 0)
      return false;
    const cfg = this.config.globe;
    const from = this.rig.getView();
    let to;
    let duration = cfg.resetDurationMs;
    if (command.type === 'RESET_VIEW') {
      if (this.kind === 'RESET') return false;
      to = {
        azimuth: cfg.initialAzimuth,
        polar: cfg.initialPolar,
        distance: cfg.initialDistance,
      };
      duration = command.durationMs ?? duration;
    } else {
      const p = geoToDirection(
        command.lat,
        command.lon,
        this.config.geo.longitudeOffsetDeg,
      );
      to = {
        azimuth: Math.atan2(p.x, p.z),
        polar: Math.acos(Math.max(-1, Math.min(1, p.y))),
        distance: command.distance ?? from.distance,
      };
    }
    to.polar = Math.max(cfg.minPolar, Math.min(cfg.maxPolar, to.polar));
    to.distance = Math.max(
      cfg.minDistance,
      Math.min(cfg.maxDistance, to.distance),
    );
    const delta =
      ((((to.azimuth - from.azimuth + Math.PI) % (Math.PI * 2)) + Math.PI * 2) %
        (Math.PI * 2)) -
      Math.PI;
    to.azimuth = from.azimuth + delta;
    if (this.reducedMotion) {
      this.active = undefined;
      this.rig.setView(to);
      return true;
    }
    this.active = {
      kind: command.type === 'RESET_VIEW' ? 'RESET' : 'FOCUS',
      from,
      to,
      startedAt: nowMs,
      lastTime: nowMs,
      duration: Math.max(
        cfg.minTransitionMs,
        Math.min(cfg.maxTransitionMs, duration),
      ),
    };
    return true;
  }
  update(nowMs: number): void {
    const current = this.active;
    if (!current || !Number.isFinite(nowMs) || nowMs < current.lastTime) return;
    current.lastTime = nowMs;
    const progress = Math.min(
      1,
      Math.max(0, (nowMs - current.startedAt) / current.duration),
    );
    const t = progress * progress * (3 - 2 * progress);
    const mix = (a: number, b: number) => a + (b - a) * t;
    this.rig.setView({
      azimuth: mix(current.from.azimuth, current.to.azimuth),
      polar: mix(current.from.polar, current.to.polar),
      distance: mix(current.from.distance, current.to.distance),
    });
    if (progress === 1) this.active = undefined;
  }
  cancel(): void {
    this.active = undefined;
  }
}
