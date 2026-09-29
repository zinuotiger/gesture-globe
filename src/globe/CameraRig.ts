import type { AppConfig } from '../config/index.ts';

export interface RigView {
  readonly azimuth: number;
  readonly polar: number;
  readonly distance: number;
  readonly target: Readonly<{ x: number; y: number; z: number }>;
}
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const wrap = (angle: number) =>
  ((((angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) -
  Math.PI;

/** Pure view authority; inputs are deltas, not velocities. Never accesses DOM. */
export class CameraRig {
  private view: RigView;
  private readonly config: Readonly<AppConfig>;
  constructor(config: Readonly<AppConfig>) {
    this.config = config;
    this.view = this.bounded({
      azimuth: config.globe.initialAzimuth,
      polar: config.globe.initialPolar,
      distance: config.globe.initialDistance,
    });
  }
  private bounded(
    input: Pick<RigView, 'azimuth' | 'polar' | 'distance'>,
  ): RigView {
    const cfg = this.config.globe;
    return Object.freeze({
      azimuth: wrap(input.azimuth),
      polar: clamp(input.polar, cfg.minPolar, cfg.maxPolar),
      distance: clamp(input.distance, cfg.minDistance, cfg.maxDistance),
      target: Object.freeze({ x: 0, y: 0, z: 0 }),
    });
  }
  getView(): RigView {
    return this.view;
  }
  setView(input: Pick<RigView, 'azimuth' | 'polar' | 'distance'>): boolean {
    if (![input.azimuth, input.polar, input.distance].every(Number.isFinite))
      return false;
    this.view = this.bounded(input);
    return true;
  }
  rotate(yaw: number, pitch: number, dt: number): boolean {
    if (![yaw, pitch, dt].every(Number.isFinite) || dt <= 0) return false;
    const limit =
      this.config.globe.maxAngularSpeed *
      Math.min(dt, this.config.globe.maxCommandDeltaSeconds);
    return this.setView({
      ...this.view,
      azimuth: this.view.azimuth + clamp(yaw, -limit, limit),
      polar: this.view.polar + clamp(pitch, -limit, limit),
    });
  }
  zoom(delta: number, dt: number): boolean {
    if (![delta, dt].every(Number.isFinite) || dt <= 0) return false;
    const limit =
      this.config.zoom.maxSpeed *
      Math.min(dt, this.config.globe.maxCommandDeltaSeconds);
    return this.setView({
      ...this.view,
      distance: this.view.distance + clamp(delta, -limit, limit),
    });
  }
  getPosition(): Readonly<{ x: number; y: number; z: number }> {
    const { distance: r, polar, azimuth } = this.view;
    return {
      x: r * Math.sin(polar) * Math.sin(azimuth),
      y: r * Math.cos(polar),
      z: r * Math.sin(polar) * Math.cos(azimuth),
    };
  }
}
