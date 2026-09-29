import { defaults } from '../config/index.ts';
import type { AppConfig } from '../config/index.ts';
import type { InputSource } from '../shared/index.ts';

const priority: Readonly<Record<InputSource, number>> = {
  mouse: 3,
  keyboard: 3,
  ui: 3,
  gesture: 2,
  agent: 1,
};
export interface SourceLockState {
  readonly owner: InputSource | null;
  readonly expiresAtMs: number | null;
  readonly gesturePaused: boolean;
}
export interface SourceLockDecision {
  readonly accepted: boolean;
  readonly reason:
    | 'ACQUIRED'
    | 'RENEWED'
    | 'PREEMPTED'
    | 'LOWER_PRIORITY'
    | 'GESTURE_PAUSED'
    | 'INVALID_SOURCE'
    | 'INVALID_TIME';
  readonly preempted: InputSource | null;
  readonly state: SourceLockState;
}

/** Pure finite lease state. Frame/dispatch/current calls advance supplied monotonic time; no timer owns a lock. */
export class SourceLockManager {
  private owner: InputSource | null = null;
  private expiresAt: number | null = null;
  private pauseUntil = 0;
  private lastTime = 0;
  constructor(private readonly config: Readonly<AppConfig> = defaults) {
    if (
      ![config.interaction.mouseLockMs, config.gesture.lostHandMs].every(
        (n) => Number.isFinite(n) && n > 0,
      )
    )
      throw new RangeError('Lock lifetimes must be finite and positive');
  }
  private snapshot(): SourceLockState {
    return Object.freeze({
      owner: this.owner,
      expiresAtMs: this.expiresAt,
      gesturePaused: this.pauseUntil > this.lastTime,
    });
  }
  private advance(atMs: number): boolean {
    if (!Number.isFinite(atMs) || atMs < this.lastTime || atMs < 0)
      return false;
    this.lastTime = atMs;
    if (this.expiresAt !== null && atMs >= this.expiresAt) {
      this.owner = null;
      this.expiresAt = null;
    }
    if (atMs >= this.pauseUntil) this.pauseUntil = 0;
    return true;
  }
  current(atMs: number): SourceLockState {
    if (!this.advance(atMs))
      throw new RangeError('Lock clock must be finite and monotonic');
    return this.snapshot();
  }
  tryAcquire(source: InputSource, atMs: number): SourceLockDecision {
    const answer = (
      accepted: boolean,
      reason: SourceLockDecision['reason'],
      preempted: InputSource | null = null,
    ) => Object.freeze({ accepted, reason, preempted, state: this.snapshot() });
    if (!Object.hasOwn(priority, source))
      return answer(false, 'INVALID_SOURCE');
    const lifetime =
      source === 'gesture'
        ? this.config.gesture.lostHandMs
        : this.config.interaction.mouseLockMs;
    const deadline = atMs + lifetime;
    if (!Number.isFinite(deadline) || deadline <= atMs || !this.advance(atMs))
      return answer(false, 'INVALID_TIME');
    if (source === 'gesture' && this.pauseUntil > atMs)
      return answer(false, 'GESTURE_PAUSED');
    if (this.owner !== null && priority[source] < priority[this.owner])
      return answer(false, 'LOWER_PRIORITY');
    const previous = this.owner;
    this.owner = source;
    this.expiresAt = deadline;
    return answer(
      true,
      previous === source ? 'RENEWED' : previous ? 'PREEMPTED' : 'ACQUIRED',
      previous !== source ? previous : null,
    );
  }
  /** Explicit source cancellation, not ordinary pointer-up: manual leases otherwise run to expiry. */
  release(source: InputSource, atMs: number): boolean {
    if (!this.advance(atMs) || this.owner !== source) return false;
    this.owner = null;
    this.expiresAt = null;
    return true;
  }
  /** Refreshed from current frame clutch state; lost frames cannot leave a permanent pause. */
  setGesturePaused(paused: boolean, atMs: number): boolean {
    const deadline = atMs + this.config.gesture.lostHandMs;
    if (
      typeof paused !== 'boolean' ||
      !Number.isFinite(deadline) ||
      deadline <= atMs ||
      !this.advance(atMs)
    )
      return false;
    this.pauseUntil = paused ? deadline : 0;
    if (paused && this.owner === 'gesture') {
      this.owner = null;
      this.expiresAt = null;
    }
    return true;
  }
  /** Safety/lifecycle cancellation always wins and needs no working clock. */
  cancelAll(): void {
    this.owner = null;
    this.expiresAt = null;
    this.pauseUntil = 0;
  }
}
