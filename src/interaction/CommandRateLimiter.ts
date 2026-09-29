import { defaults } from '../config/index.ts';
import type { AppConfig } from '../config/index.ts';
import { isGlobeCommand } from '../globe/index.ts';
import type { GlobeCommand, InputSource } from '../shared/index.ts';
import { Deduplicator } from './Deduplicator.ts';
type Motion = Extract<GlobeCommand, { type: 'ROTATE' | 'ZOOM' }>;
interface Pending {
  source: InputSource;
  command: Motion;
}
export interface BufferPushResult {
  readonly accepted: boolean;
  readonly reason:
    'BUFFERED' | 'IMMEDIATE' | 'INVALID' | 'STALE' | 'DUPLICATE' | 'DISPOSED';
  readonly commands: readonly GlobeCommand[];
}
const clamp = (n: number, limit: number) =>
  Math.max(-limit, Math.min(limit, n));

/** At most two coalesced motion slots. Discrete commands have independent bounded dedup and never queue. */
export class CommandRateLimiter {
  private readonly pending = new Map<Motion['type'], Pending>();
  private readonly discreteIds: Deduplicator;
  private readonly motionIds: Deduplicator;
  private readonly latestMotionTime = new Map<string, number>();
  private lastNow = 0;
  private lastFlush: number | undefined;
  private sequence = 0;
  private disposed = false;
  private counters = {
    coalesced: 0,
    emitted: 0,
    stale: 0,
    duplicates: 0,
    cancelled: 0,
  };
  constructor(private readonly config: Readonly<AppConfig> = defaults) {
    if (
      !Number.isFinite(config.interaction.commandHz) ||
      config.interaction.commandHz <= 0
    )
      throw new RangeError('Invalid command frequency');
    this.discreteIds = new Deduplicator(config.interaction.maxDiscreteIds);
    this.motionIds = new Deduplicator(config.interaction.maxDiscreteIds);
  }
  private advance(nowMs: number): boolean {
    if (!Number.isFinite(nowMs) || nowMs < this.lastNow || nowMs < 0)
      return false;
    this.lastNow = nowMs;
    return true;
  }
  private maxAge(source: InputSource): number {
    return source === 'gesture'
      ? this.config.vision.staleFrameMs
      : this.config.globe.commandMaxAgeMs;
  }
  private bounded(c: Motion): Motion {
    const dt = Math.min(c.dt, this.config.globe.maxCommandDeltaSeconds);
    return c.type === 'ROTATE'
      ? {
          ...c,
          dt,
          yaw: clamp(c.yaw / c.dt, this.config.globe.maxAngularSpeed) * dt,
          pitch: clamp(c.pitch / c.dt, this.config.globe.maxAngularSpeed) * dt,
        }
      : {
          ...c,
          dt,
          delta: clamp(c.delta / c.dt, this.config.zoom.maxSpeed) * dt,
        };
  }
  push(value: unknown, source: InputSource, nowMs: number): BufferPushResult {
    const answer = (
      accepted: boolean,
      reason: BufferPushResult['reason'],
      commands: GlobeCommand[] = [],
    ): BufferPushResult => ({ accepted, reason, commands });
    if (this.disposed) return answer(false, 'DISPOSED');
    if (
      !isGlobeCommand(value) ||
      !value.id.trim() ||
      !['gesture', 'mouse', 'keyboard', 'ui', 'agent'].includes(source) ||
      !this.advance(nowMs) ||
      value.at > nowMs
    )
      return answer(false, 'INVALID');
    if (nowMs - value.at > this.maxAge(source)) {
      this.counters.stale++;
      return answer(false, 'STALE');
    }
    const motion = value.type === 'ROTATE' || value.type === 'ZOOM';
    const motionKey = `${source}:${value.type}`;
    if (
      motion &&
      value.at < (this.latestMotionTime.get(motionKey) ?? -Infinity)
    )
      return answer(false, 'INVALID');
    const dedup = motion ? this.motionIds : this.discreteIds;
    if (!dedup.remember(`${source}:${value.id}`)) {
      this.counters.duplicates++;
      return answer(false, 'DUPLICATE');
    }
    if (motion) this.latestMotionTime.set(motionKey, value.at);
    if (!motion) {
      this.cancel();
      this.counters.emitted++;
      return answer(true, 'IMMEDIATE', [{ ...value }]);
    }
    // Switching source invalidates both old slots; the upstream lock must authorize the new source first.
    if ([...this.pending.values()].some((p) => p.source !== source))
      this.cancel();
    const c = this.bounded(value as Motion);
    const old = this.pending.get(c.type);
    if (
      old &&
      nowMs - old.command.at <= this.maxAge(source) &&
      old.command.traceId === c.traceId
    ) {
      const before = old.command;
      const dt = Math.min(
        before.dt + c.dt,
        this.config.globe.maxCommandDeltaSeconds,
      );
      const metadata = { ...c, dt, at: Math.min(before.at, c.at) };
      if (before.type === 'ROTATE' && c.type === 'ROTATE') {
        this.pending.set(c.type, {
          source,
          command: {
            ...metadata,
            type: 'ROTATE',
            yaw: clamp(
              before.yaw + c.yaw,
              this.config.globe.maxAngularSpeed * dt,
            ),
            pitch: clamp(
              before.pitch + c.pitch,
              this.config.globe.maxAngularSpeed * dt,
            ),
          },
        });
      } else if (before.type === 'ZOOM' && c.type === 'ZOOM') {
        this.pending.set(c.type, {
          source,
          command: {
            ...metadata,
            type: 'ZOOM',
            delta: clamp(
              before.delta + c.delta,
              this.config.zoom.maxSpeed * dt,
            ),
          },
        });
      }
      this.counters.coalesced++;
    } else {
      if (old && nowMs - old.command.at > this.maxAge(source))
        this.counters.stale++;
      else if (old) this.counters.cancelled++;
      this.pending.set(c.type, { source, command: c });
    }
    return answer(true, 'BUFFERED');
  }
  flush(nowMs: number): GlobeCommand[] {
    if (this.disposed || !this.advance(nowMs)) return [];
    for (const [type, p] of this.pending)
      if (nowMs - p.command.at > this.maxAge(p.source)) {
        this.pending.delete(type);
        this.counters.stale++;
      }
    if (
      !this.pending.size ||
      (this.lastFlush !== undefined &&
        nowMs - this.lastFlush < 1000 / this.config.interaction.commandHz)
    )
      return [];
    this.lastFlush = nowMs;
    const commands = [...this.pending.values()].map(({ command }) => ({
      ...command,
      id: `batch-${++this.sequence}:${command.id}`,
    }));
    this.pending.clear();
    this.counters.emitted += commands.length;
    return commands;
  }
  cancel(source?: InputSource): void {
    for (const [type, p] of this.pending)
      if (source === undefined || p.source === source) {
        this.pending.delete(type);
        this.counters.cancelled++;
      }
  }
  getMetrics() {
    return Object.freeze({
      ...this.counters,
      pending: this.pending.size,
      discreteIds: this.discreteIds.size,
      motionIds: this.motionIds.size,
    });
  }
  dispose(): void {
    this.cancel();
    this.discreteIds.clear();
    this.motionIds.clear();
    this.latestMotionTime.clear();
    this.disposed = true;
  }
}
