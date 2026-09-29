export type GesturePhase =
  | 'NO_HAND'
  | 'IDLE'
  | 'CANDIDATE'
  | 'ACTIVE'
  | 'RELEASING'
  | 'PAUSED'
  | 'COOLDOWN';
export interface GestureRule {
  readonly stableFrames: number;
  readonly releaseFrames: number;
  readonly discrete: boolean;
  readonly cooldownMs: number;
}
export interface GestureStep {
  atMs: number;
  present: boolean;
  enter: boolean;
  hold: boolean;
  /** Arbitration suppresses execution, never pretends the physical gesture departed. */
  blocked?: boolean;
}
export interface GestureTransition {
  readonly phase: 'START' | 'UPDATE' | 'END' | 'CANCEL' | 'TRIGGER';
  readonly atMs: number;
}

/** One candidate's temporal rule. Fusion/priority and payload mapping belong to separate layers. */
export class GestureStateMachine {
  private phase: GesturePhase = 'NO_HAND';
  private stable = 0;
  private releasing = 0;
  private lastTime = -Infinity;
  private present = false;
  private armed = true;
  private exited = true;
  private cooldownUntil = 0;
  private readonly rule: Readonly<GestureRule>;
  constructor(rule: GestureRule) {
    if (
      !Number.isSafeInteger(rule.stableFrames) ||
      rule.stableFrames < 1 ||
      !Number.isSafeInteger(rule.releaseFrames) ||
      rule.releaseFrames < 1 ||
      typeof rule.discrete !== 'boolean' ||
      !Number.isFinite(rule.cooldownMs) ||
      rule.cooldownMs < 0
    )
      throw new RangeError('Invalid gesture temporal rule');
    this.rule = Object.freeze({ ...rule });
  }
  getState() {
    return Object.freeze({
      phase: this.phase,
      stableFrames: this.stable,
      releaseFrames: this.releasing,
      armed: this.armed,
      cooldownUntilMs: this.cooldownUntil,
    });
  }
  private active() {
    return this.phase === 'ACTIVE' || this.phase === 'RELEASING';
  }
  private clear(phase: GesturePhase) {
    this.phase = phase;
    this.stable = 0;
    this.releasing = 0;
  }
  reset(): void {
    this.clear('NO_HAND');
    this.lastTime = -Infinity;
    this.present = false;
    this.armed = this.exited = true;
    this.cooldownUntil = 0;
  }
  cancel(atMs: number): GestureTransition[] {
    const time =
      Number.isFinite(atMs) && atMs >= 0
        ? Math.max(atMs, this.lastTime)
        : Math.max(0, this.lastTime);
    const transitions: GestureTransition[] = this.active()
      ? [{ phase: 'CANCEL', atMs: time }]
      : [];
    this.lastTime = time;
    this.clear(this.present ? 'IDLE' : 'NO_HAND');
    return transitions;
  }
  pause(atMs: number): GestureTransition[] {
    const result = this.cancel(atMs);
    this.clear('PAUSED');
    return result;
  }
  resume(): void {
    if (this.phase === 'PAUSED') this.clear(this.present ? 'IDLE' : 'NO_HAND');
  }
  step(input: GestureStep): GestureTransition[] {
    if (
      !Number.isFinite(input.atMs) ||
      input.atMs < 0 ||
      input.atMs <= this.lastTime
    )
      return this.cancel(input.atMs);
    this.lastTime = input.atMs;
    this.present = input.present;
    if (!input.enter || !input.present) this.exited = true;
    if (!this.armed && this.exited && input.atMs >= this.cooldownUntil)
      this.armed = true;
    if (!input.present) {
      const end: GestureTransition[] = this.active()
        ? [{ phase: 'END', atMs: input.atMs }]
        : [];
      this.clear('NO_HAND');
      return end;
    }
    if (this.phase === 'PAUSED') return [];
    if (input.blocked) {
      const cancelled: GestureTransition[] = this.active()
        ? [{ phase: 'CANCEL', atMs: input.atMs }]
        : [];
      this.clear(this.armed ? 'IDLE' : 'COOLDOWN');
      return cancelled;
    }
    if (this.active()) {
      if (input.hold) {
        this.phase = 'ACTIVE';
        this.releasing = 0;
        return [{ phase: 'UPDATE', atMs: input.atMs }];
      }
      this.phase = 'RELEASING';
      this.releasing++;
      if (this.releasing >= this.rule.releaseFrames) {
        this.clear('IDLE');
        return [{ phase: 'END', atMs: input.atMs }];
      }
      return [];
    }
    if (
      this.rule.discrete &&
      (!this.armed || input.atMs < this.cooldownUntil)
    ) {
      this.clear('COOLDOWN');
      return [];
    }
    if (!input.enter) {
      this.clear('IDLE');
      return [];
    }
    this.phase = 'CANDIDATE';
    this.stable++;
    if (this.stable < this.rule.stableFrames) return [];
    if (this.rule.discrete) {
      this.armed = false;
      this.exited = false;
      this.cooldownUntil = input.atMs + this.rule.cooldownMs;
      this.clear('COOLDOWN');
      return [{ phase: 'TRIGGER', atMs: input.atMs }];
    }
    this.phase = 'ACTIVE';
    return [{ phase: 'START', atMs: input.atMs }];
  }
}
