import { isPlainDto } from '../shared/index.ts';
import type { GlobeCommand, ViewState } from '../shared/index.ts';
import type { AppConfig } from '../config/index.ts';
import type { CameraRig } from './CameraRig.ts';

type TransitionCommand = Extract<
  GlobeCommand,
  { type: 'RESET_VIEW' | 'FOCUS_GEO' }
>;
export interface TransitionDriver {
  start(command: TransitionCommand, nowMs: number): boolean;
  cancel(): void;
  update(nowMs: number): void;
  readonly kind: ViewState['transition'];
  setReducedMotion?(enabled: boolean): void;
}
export function isGlobeCommand(value: unknown): value is GlobeCommand {
  if (!value || typeof value !== 'object' || !isPlainDto(value)) return false;
  const c = value as Record<string, unknown>;
  if (
    c.schemaVersion !== 1 ||
    typeof c.id !== 'string' ||
    !c.id ||
    typeof c.at !== 'number' ||
    c.at < 0 ||
    ('traceId' in c && (typeof c.traceId !== 'string' || !c.traceId))
  )
    return false;
  const common = ['schemaVersion', 'id', 'at', 'traceId', 'type'];
  const fields: Record<string, string[]> = {
    ROTATE: ['yaw', 'pitch', 'dt'],
    ZOOM: ['delta', 'dt'],
    RESET_VIEW: ['durationMs'],
    FOCUS_GEO: ['lat', 'lon', 'distance'],
    SET_AUTOROTATE: ['enabled'],
    CANCEL_TRANSITION: [],
  };
  if (
    typeof c.type !== 'string' ||
    !Object.hasOwn(fields, c.type) ||
    Object.keys(c).some(
      (key) => ![...common, ...fields[c.type as string]!].includes(key),
    )
  )
    return false;
  switch (c.type) {
    case 'ROTATE':
      return (
        typeof c.yaw === 'number' &&
        typeof c.pitch === 'number' &&
        typeof c.dt === 'number' &&
        c.dt > 0
      );
    case 'ZOOM':
      return (
        typeof c.delta === 'number' && typeof c.dt === 'number' && c.dt > 0
      );
    case 'RESET_VIEW':
      return (
        c.durationMs === undefined ||
        (typeof c.durationMs === 'number' && c.durationMs >= 0)
      );
    case 'FOCUS_GEO':
      return (
        typeof c.lat === 'number' &&
        Math.abs(c.lat) <= 90 &&
        typeof c.lon === 'number' &&
        Math.abs(c.lon) <= 180 &&
        (c.distance === undefined ||
          (typeof c.distance === 'number' && c.distance > 0))
      );
    case 'SET_AUTOROTATE':
      return typeof c.enabled === 'boolean';
    case 'CANCEL_TRANSITION':
      return true;
    default:
      return false;
  }
}
export class CommandExecutor {
  private readonly rig: CameraRig;
  private readonly config: Readonly<AppConfig>;
  private readonly transitions: TransitionDriver | undefined;
  private readonly seen = new Set<string>();
  private autoRotate: boolean;
  private previousTime: number | undefined;
  private disposed = false;
  private reducedMotion = false;
  constructor(
    rig: CameraRig,
    config: Readonly<AppConfig>,
    transitions?: TransitionDriver,
  ) {
    this.rig = rig;
    this.config = config;
    this.transitions = transitions;
    this.autoRotate = config.app.autoRotateOnStart;
  }
  execute(value: unknown, nowMs: number): boolean {
    if (
      this.disposed ||
      !isGlobeCommand(value) ||
      !Number.isFinite(nowMs) ||
      value.at > nowMs ||
      nowMs - value.at > this.config.globe.commandMaxAgeMs ||
      this.seen.has(value.id)
    )
      return false;
    let accepted = true;
    switch (value.type) {
      case 'ROTATE':
        this.onUserInput();
        accepted = this.rig.rotate(value.yaw, value.pitch, value.dt);
        break;
      case 'ZOOM':
        this.onUserInput();
        accepted = this.rig.zoom(value.delta, value.dt);
        break;
      case 'SET_AUTOROTATE':
        this.autoRotate = value.enabled && !this.reducedMotion;
        break;
      case 'CANCEL_TRANSITION':
        this.onUserInput();
        break;
      case 'RESET_VIEW':
      case 'FOCUS_GEO':
        accepted = this.transitions?.start(value, nowMs) ?? false;
        if (accepted) this.autoRotate = false;
        break;
    }
    if (accepted) {
      this.seen.add(value.id);
      if (this.seen.size > this.config.interaction.maxDiscreteIds)
        this.seen.delete(this.seen.values().next().value!);
    }
    return accepted;
  }
  onUserInput(): void {
    this.autoRotate = false;
    this.transitions?.cancel();
  }
  setReducedMotion(enabled: boolean): void {
    if (this.disposed || typeof enabled !== 'boolean') return;
    this.reducedMotion = enabled;
    this.transitions?.setReducedMotion?.(enabled);
    if (enabled) this.onUserInput();
  }
  suspendTransition(): void {
    this.transitions?.cancel();
    this.resetClock();
  }
  update(nowMs: number): void {
    if (
      this.disposed ||
      !Number.isFinite(nowMs) ||
      nowMs < 0 ||
      (this.previousTime !== undefined && nowMs < this.previousTime)
    )
      return;
    this.transitions?.update(nowMs);
    const dt =
      this.previousTime === undefined
        ? 0
        : Math.min(
            (nowMs - this.previousTime) / 1000,
            this.config.globe.maxCommandDeltaSeconds,
          );
    this.previousTime = nowMs;
    if (
      this.autoRotate &&
      (this.transitions?.kind ?? 'IDLE') === 'IDLE' &&
      dt > 0
    )
      this.rig.rotate(this.config.globe.autoRotateSpeed * dt, 0, dt);
  }
  resetClock(): void {
    this.previousTime = undefined;
  }
  getViewState(): ViewState {
    return Object.freeze({
      schemaVersion: 1,
      ...this.rig.getView(),
      autoRotate: this.autoRotate,
      transition: this.transitions?.kind ?? 'IDLE',
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.onUserInput();
    this.seen.clear();
    this.resetClock();
  }
}
