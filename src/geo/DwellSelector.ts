import type { AppConfig } from '../config/index.ts';
import type { ScreenPoint } from './ScreenMapper.ts';

type SurfacePoint = Readonly<{ x: number; y: number; z: number }>;
type Phase = 'IDLE' | 'DWELLING' | 'DRIFTING' | 'COOLDOWN' | 'SELECTED';
export interface DwellSelection {
  readonly selectionId: string;
  readonly selectedAtMs: number;
  readonly point: SurfacePoint;
}
export interface DwellState {
  readonly phase: Phase;
  readonly progress: number;
  readonly center: Readonly<ScreenPoint> | null;
}
function direction(point: SurfacePoint) {
  if (![point.x, point.y, point.z].every(Number.isFinite)) return undefined;
  const scale = Math.max(
    Math.abs(point.x),
    Math.abs(point.y),
    Math.abs(point.z),
  );
  if (!scale) return undefined;
  const x = point.x / scale,
    y = point.y / scale,
    z = point.z / scale,
    length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}
/** Pure bounded state. The owner feeds valid hits/cancels; no timer or recognition logic. */
export class DwellSelector {
  private center: Readonly<ScreenPoint> | undefined;
  private target: SurfacePoint | undefined;
  private elapsed = 0;
  private lastAt: number | undefined;
  private driftAt: number | undefined;
  private cooldownUntil = -Infinity;
  private latched = false;
  private phase: Phase = 'IDLE';
  private sequence = 0;
  constructor(
    private readonly config: Readonly<AppConfig>,
    private readonly idPrefix = 'geo-selection',
  ) {
    if (!idPrefix.trim()) throw new TypeError('Selection ID prefix required');
  }
  cancel(): DwellState {
    this.center = undefined;
    this.target = undefined;
    this.elapsed = 0;
    this.lastAt = undefined;
    this.driftAt = undefined;
    this.latched = false;
    this.phase = 'IDLE';
    // Cooldown and sequence survive cancellation; no duplicate IDs or rapid re-trigger.
    return this.getState();
  }
  private begin(pointer: ScreenPoint, hit: SurfacePoint) {
    this.center = Object.freeze({ ...pointer });
    this.target = Object.freeze({ ...hit });
    this.elapsed = 0;
    this.driftAt = undefined;
    this.latched = false;
    this.phase = 'DWELLING';
  }
  getState(): DwellState {
    return Object.freeze({
      phase: this.phase,
      progress: Math.min(1, this.elapsed / this.config.point.dwellMs),
      center: this.center ?? null,
    });
  }
  expire(atMs: number): DwellState {
    if (
      !Number.isFinite(atMs) ||
      (this.lastAt !== undefined &&
        atMs - this.lastAt > this.config.vision.staleFrameMs)
    )
      return this.cancel();
    return this.getState();
  }
  update(
    pointer: ScreenPoint | undefined,
    hit: SurfacePoint | undefined,
    atMs: number,
  ): { state: DwellState; selection?: DwellSelection } {
    if (
      !Number.isFinite(atMs) ||
      atMs < 0 ||
      !pointer ||
      !hit ||
      ![pointer.x, pointer.y].every(Number.isFinite) ||
      pointer.x < 0 ||
      pointer.x > 1 ||
      pointer.y < 0 ||
      pointer.y > 1 ||
      !direction(hit)
    )
      return { state: this.cancel() };
    if (this.lastAt !== undefined && atMs <= this.lastAt)
      return { state: this.cancel() };
    const dt = this.lastAt === undefined ? 0 : atMs - this.lastAt;
    if (dt > this.config.vision.staleFrameMs) this.cancel();
    this.lastAt = atMs;
    const a = this.target && direction(this.target),
      b = direction(hit)!;
    // radiusNorm also defines a spherical fraction-of-revolution drift limit.
    const targetMoved =
      !!a &&
      Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) >
        this.config.point.radiusNorm * 2 * Math.PI;
    const pointerMoved =
      !!this.center &&
      Math.hypot(pointer.x - this.center.x, pointer.y - this.center.y) >
        this.config.point.radiusNorm;
    if (this.latched && !pointerMoved && !targetMoved) {
      this.phase = atMs < this.cooldownUntil ? 'COOLDOWN' : 'SELECTED';
      return { state: this.getState() };
    }
    if (this.latched) {
      this.center = undefined;
      this.target = undefined;
      this.latched = false;
      this.elapsed = 0;
    }
    if (atMs < this.cooldownUntil) {
      this.phase = 'COOLDOWN';
      return { state: this.getState() };
    }
    if (!this.center || !this.target || targetMoved) {
      this.begin(pointer, hit);
      return { state: this.getState() };
    }
    if (pointerMoved) {
      this.driftAt ??= atMs;
      if (atMs - this.driftAt > this.config.point.driftGraceMs)
        this.begin(pointer, hit);
      else this.phase = 'DRIFTING';
      return { state: this.getState() };
    }
    if (this.driftAt !== undefined) {
      if (atMs - this.driftAt > this.config.point.driftGraceMs) {
        this.begin(pointer, hit);
        return { state: this.getState() };
      }
      this.driftAt = undefined;
    } else this.elapsed += dt;
    this.phase = 'DWELLING';
    if (this.elapsed >= this.config.point.dwellMs) {
      this.elapsed = this.config.point.dwellMs;
      this.latched = true;
      this.cooldownUntil = atMs + this.config.point.cooldownMs;
      this.phase = 'COOLDOWN';
      return {
        state: this.getState(),
        selection: Object.freeze({
          selectionId: `${this.idPrefix}-${++this.sequence}`,
          selectedAtMs: atMs,
          point: this.target,
        }),
      };
    }
    return { state: this.getState() };
  }
}
