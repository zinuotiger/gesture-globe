import type { AppConfig } from '../config/index.ts';
import type { GlobeCommand, InputSource, ViewState } from '../shared/index.ts';
import { mapIntent, type MappedAction } from './IntentToCommand.ts';
import { SourceLockManager } from './SourceLockManager.ts';
import { CommandRateLimiter } from './CommandRateLimiter.ts';
import { Deduplicator } from './Deduplicator.ts';
import type { DispatchResult, InputPort } from './input.types.ts';

export interface InteractionEvent {
  readonly type:
    | 'SOURCE_CHANGED'
    | 'SOURCE_CANCELLED'
    | 'COMMAND_RESULT'
    | 'INPUT_REJECTED'
    | 'INPUT_ACCEPTED';
  readonly atMs: number;
  readonly source: InputSource | null;
  readonly previous?: InputSource | null;
  readonly traceId?: string;
  readonly id?: string;
  readonly reason?: string;
  readonly accepted?: boolean;
  readonly commandType?: GlobeCommand['type'];
}
export interface InteractionHooks {
  onRoute?(action: Extract<MappedAction, { type: 'DRAW_ROUTE' }>): boolean;
  onEvent?(event: Readonly<InteractionEvent>): void;
  onCancel?(source: InputSource, reason: string): void;
  onSelection?(
    action: Extract<
      MappedAction,
      { type: 'SELECT_POINTER' | 'SELECT_CANCEL' | 'SELECT_GEO' }
    >,
  ): boolean;
}
const ok = (): DispatchResult => ({ accepted: true, reason: 'ACCEPTED' });

/** Single validated/owned command bus; pending movement is bounded and caller-flushed. */
export class CommandBus implements InputPort {
  private disposed = false;
  readonly locks: SourceLockManager;
  private readonly buffer: CommandRateLimiter;
  private readonly edgeIds: Deduplicator;
  private readonly motionIds: Deduplicator;
  private owner: InputSource | null = null;
  private traceId: string | undefined;
  private lastNow = 0;
  private sequence = 0;
  private observerErrors = 0;
  private readonly observers = new Set<
    (event: Readonly<InteractionEvent>) => void
  >();
  subscribe(listener: (event: Readonly<InteractionEvent>) => void): () => void {
    if (!this.disposed) this.observers.add(listener);
    return () => {
      this.observers.delete(listener);
    };
  }
  constructor(
    private readonly config: Readonly<AppConfig>,
    private readonly now: () => number,
    private readonly view: () => Pick<ViewState, 'distance'> &
      Partial<ViewState>,
    private readonly execute: (
      command: GlobeCommand,
      source: InputSource,
    ) => boolean,
    private readonly hooks: InteractionHooks = {},
  ) {
    this.locks = new SourceLockManager(config);
    this.buffer = new CommandRateLimiter(config);
    this.edgeIds = new Deduplicator(config.interaction.maxDiscreteIds);
    this.motionIds = new Deduplicator(config.interaction.maxDiscreteIds);
  }
  private event(event: InteractionEvent): void {
    try {
      this.hooks.onEvent?.(Object.freeze(event));
    } catch {
      this.observerErrors++;
    }
    for (const listener of [...this.observers]) {
      try {
        listener(Object.freeze(event));
      } catch {
        this.observerErrors++;
      }
    }
  }
  private clock(): number {
    const now = this.now();
    if (!Number.isFinite(now) || now < this.lastNow || now < 0)
      throw new RangeError('Invalid interaction clock');
    this.lastNow = now;
    return now;
  }
  private cancelOwned(source: InputSource, reason: string): void {
    this.buffer.cancel(source);
    try {
      this.hooks.onCancel?.(source, reason);
    } catch {
      this.observerErrors++;
    }
    try {
      this.hooks.onSelection?.({ type: 'SELECT_CANCEL', source });
    } catch {
      this.observerErrors++;
    }
    this.event({
      type: 'SOURCE_CANCELLED',
      atMs: this.lastNow,
      source,
      reason,
      ...(this.traceId ? { traceId: this.traceId } : {}),
    });
  }
  private changeOwner(
    source: InputSource | null,
    reason: string,
    nextTrace?: string,
  ): void {
    if (this.owner === source) return;
    const previous = this.owner;
    if (previous) this.cancelOwned(previous, reason);
    if (previous && reason === 'LEASE_EXPIRED')
      this.interrupt(previous, this.traceId);
    this.owner = source;
    if (nextTrace) this.traceId = nextTrace;
    this.event({
      type: 'SOURCE_CHANGED',
      atMs: this.lastNow,
      source,
      previous,
      reason,
      ...(this.traceId ? { traceId: this.traceId } : {}),
    });
    if (!source) this.traceId = undefined;
  }
  private run(command: GlobeCommand, source: InputSource): DispatchResult {
    let accepted = false;
    let reason: DispatchResult['reason'] = 'EXECUTION_REJECTED';
    try {
      accepted = this.execute(command, source);
    } catch {
      reason = 'HANDLER_FAILED';
    }
    this.event({
      type: 'COMMAND_RESULT',
      atMs: this.lastNow,
      source,
      id: command.id,
      commandType: command.type,
      ...(command.traceId ? { traceId: command.traceId } : {}),
      accepted,
      reason: accepted ? 'EXECUTED' : reason,
    });
    return accepted ? ok() : { accepted: false, reason };
  }
  private interrupt(source: InputSource, traceId?: string): void {
    this.run(
      {
        schemaVersion: 1,
        id: `interrupt-${++this.sequence}`,
        at: this.lastNow,
        type: 'CANCEL_TRANSITION',
        ...(traceId ? { traceId } : {}),
      },
      source,
    );
    this.run(
      {
        schemaVersion: 1,
        id: `stop-auto-${++this.sequence}`,
        at: this.lastNow,
        type: 'SET_AUTOROTATE',
        enabled: false,
        ...(traceId ? { traceId } : {}),
      },
      source,
    );
  }
  dispatch(value: unknown): DispatchResult {
    if (this.disposed) return { accepted: false, reason: 'DISPOSED' };
    try {
      const nowMs = this.clock();
      const mapped = mapIntent(
        value,
        { nowMs, view: this.view() },
        this.config,
      );
      if (!mapped.ok) {
        this.event({
          type: 'INPUT_REJECTED',
          source: null,
          atMs: nowMs,
          reason: mapped.reason,
        });
        return { accepted: false, reason: 'INVALID_INPUT' };
      }
      const { input, action } = mapped;
      const ids = input.phase === 'UPDATE' ? this.motionIds : this.edgeIds;
      const key = `${input.source}:${input.id}`;
      if (ids.seen(key)) return { accepted: false, reason: 'DUPLICATE' };
      this.changeOwner(this.locks.current(nowMs).owner, 'LEASE_EXPIRED');
      if (action.type === 'PAUSE_GESTURE') {
        ids.remember(key);
        this.setGesturePaused(action.paused);
        return ok();
      }
      if (
        action.type === 'CONTROL_END' ||
        action.type === 'CONTROL_CANCEL' ||
        action.type === 'SELECT_CANCEL'
      ) {
        ids.remember(key);
        this.cancelSource(input.source, action.type);
        return ok();
      }
      const decision = this.locks.tryAcquire(input.source, nowMs);
      if (!decision.accepted) {
        this.event({
          type: 'INPUT_REJECTED',
          source: input.source,
          atMs: nowMs,
          id: input.id,
          reason: decision.reason,
        });
        return { accepted: false, reason: 'SOURCE_LOCKED' };
      }
      ids.remember(key);
      const changed = this.owner !== input.source;
      const trace =
        input.traceId ??
        (changed || input.phase === 'START' || input.phase === 'TRIGGER'
          ? `input:${input.source}:${input.id}`
          : this.traceId) ??
        `input:${input.source}:${input.id}`;
      this.changeOwner(input.source, 'PREEMPTED', trace);
      this.traceId = trace;
      this.event({
        type: 'INPUT_ACCEPTED',
        atMs: nowMs,
        source: input.source,
        id: input.id,
        traceId: trace,
      });
      const currentView = this.view();
      if (
        action.type !== 'COMMAND' ||
        !['CANCEL_TRANSITION', 'RESET_VIEW', 'FOCUS_GEO'].includes(
          action.command.type,
        )
      ) {
        if (
          action.type === 'CONTROL_START' ||
          changed ||
          (currentView.transition && currentView.transition !== 'IDLE') ||
          currentView.autoRotate === true
        )
          this.interrupt(input.source, trace);
      }
      if (action.type === 'CONTROL_START') {
        this.buffer.cancel(input.source);
        return ok();
      }
      if (action.type === 'DRAW_ROUTE')
        return this.hooks.onRoute?.(action)
          ? ok()
          : { accepted: false, reason: 'EXECUTION_REJECTED' };
      if (action.type === 'SELECT_POINTER' || action.type === 'SELECT_GEO')
        return this.hooks.onSelection?.({ ...action, traceId: trace })
          ? ok()
          : { accepted: false, reason: 'EXECUTION_REJECTED' };
      if (action.type !== 'COMMAND')
        return { accepted: false, reason: 'INVALID_INPUT' };
      if (action.command.type === 'CANCEL_TRANSITION') {
        this.buffer.cancel();
        this.cancelOwned(input.source, 'EXPLICIT_CANCEL');
      }
      const result = this.buffer.push(
        { ...action.command, traceId: trace },
        input.source,
        nowMs,
      );
      if (!result.accepted)
        return { accepted: false, reason: 'EXECUTION_REJECTED' };
      if (result.commands.length) {
        for (const command of result.commands) {
          const execution = this.run(command, input.source);
          if (!execution.accepted) return execution;
          // A completed configuration action has no live movement lease.
          // Release ownership without an expiry interrupt undoing its setting.
          if (
            action.command.type === 'SET_AUTOROTATE' &&
            command.type === 'SET_AUTOROTATE' &&
            command.enabled
          ) {
            this.locks.release(input.source, nowMs);
            this.changeOwner(null, 'CONFIG_COMPLETE');
          }
        }
        return ok();
      }
      this.flush();
      return ok(); // Accepted into the bounded buffer; COMMAND_RESULT records actual execution.
    } catch {
      return { accepted: false, reason: 'HANDLER_FAILED' };
    }
  }
  flush(): void {
    if (this.disposed) return;
    try {
      const nowMs = this.clock();
      this.changeOwner(this.locks.current(nowMs).owner, 'LEASE_EXPIRED');
      if (!this.owner) {
        this.buffer.cancel();
        return;
      }
      for (const command of this.buffer.flush(nowMs))
        this.run(command, this.owner);
    } catch {
      this.buffer.cancel();
    }
  }
  setGesturePaused(paused: boolean): void {
    if (this.disposed) return;
    const time = this.clock();
    this.locks.setGesturePaused(paused, time);
    if (paused) {
      if (this.owner === 'gesture') {
        this.changeOwner(null, 'CLUTCH');
        this.interrupt('gesture');
      } else this.buffer.cancel('gesture');
    }
  }
  cancelSource(source: InputSource, reason = 'CANCELLED'): void {
    if (this.disposed) return;
    this.clock();
    this.locks.release(source, this.lastNow);
    if (this.owner === source) {
      this.changeOwner(null, reason);
      this.interrupt(source);
    } else this.cancelOwned(source, reason);
  }
  cancelAgent(): void {
    if (!this.disposed && this.owner === 'agent')
      this.cancelSource('agent', 'AGENT_CANCELLED');
  }
  /** Only a fresh validated held-Victory frame may sustain its already-owned reset. */
  renewGestureReset(): boolean {
    if (
      this.disposed ||
      this.owner !== 'gesture' ||
      this.view().transition !== 'RESET'
    )
      return false;
    const now = this.clock();
    if (this.locks.current(now).owner !== 'gesture') return false;
    return this.locks.tryAcquire('gesture', now).accepted;
  }
  renewAgentTransition(): boolean {
    if (
      this.disposed ||
      !this.config.features.agent ||
      this.owner !== 'agent' ||
      this.view().transition === 'IDLE'
    )
      return false;
    const now = this.clock();
    if (this.locks.current(now).owner !== 'agent') return false;
    return this.locks.tryAcquire('agent', now).accepted;
  }
  cancelAll(reason = 'LIFECYCLE'): void {
    if (this.disposed) return;
    try {
      this.clock();
    } catch {
      /* Safety uses the last valid clock. */
    }
    const source = this.owner ?? 'ui';
    this.changeOwner(null, reason);
    this.buffer.cancel();
    this.locks.cancelAll();
    this.interrupt(source);
  }
  getState() {
    return Object.freeze({
      ...this.locks.current(this.clock()),
      ...this.buffer.getMetrics(),
      observerErrors: this.observerErrors,
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.cancelAll('DISPOSED');
    this.disposed = true;
    this.buffer.dispose();
    this.edgeIds.clear();
    this.motionIds.clear();
    this.observers.clear();
  }
}
