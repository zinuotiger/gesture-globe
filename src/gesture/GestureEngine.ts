import { defaults } from '../config/index.ts';
import type { AppConfig } from '../config/index.ts';
import { isPlainDto } from '../shared/index.ts';
import type { GestureIntent, VisionFrame, Point2 } from '../shared/index.ts';
import { PrimaryHandSelector } from './PrimaryHandSelector.ts';
import { TemporalFilter, applyDeadzone } from './TemporalFilter.ts';
import type { FilteredHand } from './TemporalFilter.ts';
import { GestureStateMachine } from './GestureStateMachine.ts';
import type { GestureTransition } from './GestureStateMachine.ts';
import { pinchConditions, zoomDelta } from './PinchZoom.ts';
import { mapTransition } from './IntentMapper.ts';

export function rotateDelta(
  sample: FilteredHand,
  config: Readonly<AppConfig> = defaults,
): Point2 {
  if (
    !sample.canMove ||
    !Number.isFinite(sample.dtSeconds) ||
    sample.dtSeconds <= 0
  )
    return { x: 0, y: 0 };
  const axis = (delta: number, raw: number, gain: number, invert: boolean) => {
    if (!Number.isFinite(delta) || !Number.isFinite(raw)) return 0;
    // No inertia: a stationary raw hand cannot continue an EMA convergence tail.
    const rawSpeed = raw / sample.dtSeconds;
    const filteredSpeed = delta / sample.dtSeconds;
    if (!Number.isFinite(rawSpeed) || !Number.isFinite(filteredSpeed)) return 0;
    if (Math.abs(rawSpeed) <= config.rotate.deadzoneSpeed) return 0;
    const speed = applyDeadzone(filteredSpeed, config.rotate.deadzoneSpeed)!;
    const bounded = Math.max(
      -config.rotate.maxSpeed,
      Math.min(config.rotate.maxSpeed, speed),
    );
    return (invert ? -1 : 1) * bounded * sample.dtSeconds * gain;
  };
  return {
    x: axis(
      sample.delta.x,
      sample.rawDelta.x,
      config.rotate.yawGain,
      config.rotate.invertX,
    ),
    y: axis(
      sample.delta.y,
      sample.rawDelta.y,
      config.rotate.pitchGain,
      config.rotate.invertY,
    ),
  };
}

/** Pure VisionFrame → GestureIntent boundary. Only implemented modes are enabled. */
export class GestureEngine {
  private readonly selector: PrimaryHandSelector;
  private readonly filter: TemporalFilter;
  private readonly rotate: GestureStateMachine;
  private readonly fist: GestureStateMachine;
  private readonly zoom: GestureStateMachine;
  private readonly victory: GestureStateMachine;
  private victoryScore = 0;
  private pointActive = false;
  private pointScore = 0;
  private pinchCandidate = false;
  private pinchRatio: number | undefined;
  private pinchConfidence = 0;
  private paused = false;
  private fistScore = 0;
  private session: string | undefined;
  private handId: string | undefined;
  private handPresent = false;
  private sequence = 0;
  private lastFrame = -1;
  private lastTime = -Infinity;
  private score = 0;
  private resetReason = 'INITIAL';
  constructor(private readonly config: Readonly<AppConfig> = defaults) {
    this.selector = new PrimaryHandSelector(config);
    this.filter = new TemporalFilter(config);
    this.rotate = new GestureStateMachine({
      stableFrames: config.openPalm.stableFrames,
      releaseFrames: config.gesture.releaseFrames,
      discrete: false,
      cooldownMs: 0,
    });
    this.fist = new GestureStateMachine({
      stableFrames: config.fist.stableFrames,
      releaseFrames: config.gesture.releaseFrames,
      discrete: false,
      cooldownMs: 0,
    });
    this.zoom = new GestureStateMachine({
      stableFrames: config.pinch.stableFrames,
      releaseFrames: config.gesture.releaseFrames,
      discrete: false,
      cooldownMs: 0,
    });
    this.victory = new GestureStateMachine({
      stableFrames: config.victory.stableFrames,
      releaseFrames: config.gesture.releaseFrames,
      discrete: true,
      cooldownMs: config.victory.cooldownMs,
    });
  }
  getDebugState() {
    const zoom = this.zoom.getState();
    const zoomActive = zoom.phase === 'ACTIVE' || zoom.phase === 'RELEASING';
    const rotate = this.rotate.getState();
    const rotateActive =
      rotate.phase === 'ACTIVE' || rotate.phase === 'RELEASING';
    const victoryCandidate =
      this.victoryScore >= this.config.victory.enterScore;
    const mode = this.paused
      ? this.fist.getState()
      : this.pointActive
        ? {
            phase: 'ACTIVE' as const,
            stableFrames: 1,
            releaseFrames: 0,
            armed: true,
            cooldownUntilMs: 0,
          }
        : zoomActive || this.pinchCandidate
          ? zoom
          : victoryCandidate
            ? this.victory.getState()
            : rotate;
    return Object.freeze({
      ...mode,
      phase: this.paused ? ('PAUSED' as const) : mode.phase,
      schemaVersion: 1 as const,
      configVersion: this.config.configVersion,
      frameId: this.lastFrame >= 0 ? this.lastFrame : null,
      captureTimeMs: Number.isFinite(this.lastTime) ? this.lastTime : null,
      sessionId: this.session ?? null,
      primaryHandId: this.handPresent ? (this.handId ?? null) : null,
      handPresent: this.handPresent,
      activeGesture: this.paused
        ? ('PAUSE' as const)
        : this.pointActive
          ? ('SELECT' as const)
          : zoomActive
            ? ('ZOOM' as const)
            : rotateActive
              ? ('ROTATE' as const)
              : ('NONE' as const),
      candidate:
        this.fistScore >= this.config.fist.enterScore
          ? 'Closed_Fist'
          : this.victoryScore >= this.config.victory.enterScore
            ? 'Victory'
            : this.pinchCandidate || zoomActive
              ? 'Pinch'
              : this.pointActive
                ? 'Pointing_Up'
                : this.score >= this.config.openPalm.enterScore
                  ? 'Open_Palm'
                  : 'None',
      candidateScore:
        this.fistScore >= this.config.fist.enterScore
          ? this.fistScore
          : this.victoryScore >= this.config.victory.enterScore
            ? this.victoryScore
            : this.pinchCandidate || zoomActive
              ? this.pinchConfidence
              : this.pointActive
                ? this.pointScore
                : this.score,
      pinchRatio: this.pinchRatio ?? null,
      clutchPaused: this.paused,
      fistStableFrames: this.fist.getState().stableFrames,
      victory: this.victory.getState(),
      pointingActive: this.pointActive,
      resetReason: this.resetReason,
    });
  }
  private intents(
    transitions: readonly GestureTransition[],
    delta: Point2 = { x: 0, y: 0 },
    kind: 'ROTATE' | 'ZOOM' | 'PAUSE' | 'RESET' | 'SELECT' = 'ROTATE',
    confidence = this.score,
    pointer?: Point2,
  ): GestureIntent[] {
    if (!this.session || !this.handId) return [];
    return transitions.map((t) =>
      mapTransition(t, {
        id: `gesture-${this.session}-${++this.sequence}`,
        sessionId: this.session!,
        sourceHandId: this.handId!,
        kind,
        confidence,
        delta,
        ...(pointer ? { pointer } : {}),
      }),
    );
  }
  private endPoint(atMs: number, phase: 'END' | 'CANCEL'): GestureIntent[] {
    if (!this.pointActive) return [];
    this.pointActive = false;
    return this.intents(
      [{ phase, atMs: Math.max(0, atMs) }],
      { x: 0, y: 0 },
      'SELECT',
      this.pointScore,
    );
  }
  private cancel(reason: string, atMs = this.lastTime): GestureIntent[] {
    this.resetReason = reason;
    this.filter.reset();
    this.victory.cancel(atMs);
    const cancelled = this.intents(this.rotate.cancel(atMs));
    cancelled.push(...this.endPoint(atMs, 'CANCEL'));
    cancelled.push(
      ...this.intents(
        this.zoom.cancel(atMs),
        { x: 0, y: 0 },
        'ZOOM',
        this.pinchConfidence,
      ),
    );
    this.pinchCandidate = false;
    if (this.paused)
      cancelled.push(
        ...this.intents(
          this.fist.cancel(atMs),
          { x: 0, y: 0 },
          'PAUSE',
          this.fistScore,
        ),
      );
    this.fist.reset();
    this.paused = false;
    this.score = this.victoryScore = this.pointScore = this.fistScore = 0;
    this.pinchRatio = undefined;
    this.handPresent = false;
    return cancelled;
  }
  reset(reason = 'RESET'): GestureIntent[] {
    const cancelled = this.cancel(reason);
    this.selector.reset();
    this.filter.reset();
    this.rotate.reset();
    this.zoom.reset();
    this.victory.reset();
    this.victoryScore = 0;
    this.pointScore = 0;
    this.pinchRatio = undefined;
    this.pinchConfidence = 0;
    this.session = this.handId = undefined;
    this.lastFrame = -1;
    this.lastTime = -Infinity;
    this.score = 0;
    this.fistScore = 0;
    return cancelled;
  }
  update(
    frame: VisionFrame,
    context: { readonly manualInputLocked?: boolean } = {},
  ): GestureIntent[] {
    if (
      !frame ||
      !isPlainDto(frame) ||
      frame.schemaVersion !== 1 ||
      typeof frame.sessionId !== 'string' ||
      !frame.sessionId ||
      !Number.isSafeInteger(frame.frameId) ||
      frame.frameId < 0 ||
      typeof frame.captureTimeMs !== 'number' ||
      frame.captureTimeMs < 0 ||
      typeof frame.resultTimeMs !== 'number' ||
      frame.resultTimeMs < frame.captureTimeMs ||
      !Array.isArray(frame.hands) ||
      frame.hands.length > 2
    )
      return this.cancel('INVALID_FRAME');
    if (this.session && frame.sessionId !== this.session)
      return this.cancel('WRONG_SESSION');
    if (frame.frameId <= this.lastFrame || frame.captureTimeMs <= this.lastTime)
      return this.cancel('ORDER');
    this.session = frame.sessionId;
    this.lastFrame = frame.frameId;
    this.lastTime = frame.captureTimeMs;
    if (
      frame.resultTimeMs - frame.captureTimeMs >
      this.config.vision.staleFrameMs
    )
      return this.cancel('STALE');
    const selected = this.selector.select(frame);
    this.handPresent = !!selected;
    const categoryScore = (name: string) =>
      selected
        ? Math.max(
            0,
            ...selected.hand.gestures
              .filter((g) => g.name === name)
              .map((g) => g.score),
          )
        : 0;
    this.score = categoryScore('Open_Palm');
    this.victoryScore = categoryScore('Victory');
    this.pointScore = categoryScore('Pointing_Up');
    this.fistScore = selected
      ? Math.max(
          0,
          ...selected.hand.gestures
            .filter((g) => g.name === 'Closed_Fist')
            .map((g) => g.score),
        )
      : 0;
    const fistCandidate = this.fistScore >= this.config.fist.enterScore;
    const clutch = this.fist.step({
      atMs: frame.captureTimeMs,
      present: !!selected,
      enter: fistCandidate,
      hold: fistCandidate,
    });
    if (clutch.some((t) => t.phase === 'START')) {
      // Cancel active motion before announcing PAUSE, with no lower-priority update on this frame.
      const cancelled = this.intents(this.rotate.pause(frame.captureTimeMs));
      cancelled.push(...this.endPoint(frame.captureTimeMs, 'CANCEL'));
      cancelled.push(
        ...this.intents(
          this.zoom.pause(frame.captureTimeMs),
          { x: 0, y: 0 },
          'ZOOM',
          this.pinchConfidence,
        ),
      );
      this.pinchCandidate = false;
      if (selected) this.handId = selected.localId;
      this.paused = true;
      this.filter.reset();
      return [
        ...cancelled,
        ...this.intents(clutch, { x: 0, y: 0 }, 'PAUSE', this.fistScore),
      ];
    }
    if (this.paused) {
      this.filter.reset();
      if (clutch.some((t) => t.phase === 'END')) {
        const end = this.intents(
          clutch,
          { x: 0, y: 0 },
          'PAUSE',
          this.fistScore,
        );
        this.paused = false;
        this.rotate.resume();
        this.zoom.resume();
        return end;
      }
      return [];
    }
    const filtered = this.filter.update({
      sessionId: frame.sessionId,
      frameId: frame.frameId,
      captureTimeMs: frame.captureTimeMs,
      resultTimeMs: frame.resultTimeMs,
      handId: selected?.localId,
      features: selected?.features,
    });
    if (filtered && !filtered.canMove && filtered.resetReason !== 'FIRST')
      return this.cancel(filtered.resetReason);
    if (selected) this.handId = selected.localId;
    const victoryCandidate =
      this.victoryScore >= this.config.victory.enterScore;
    const reset = this.victory.step({
      atMs: frame.captureTimeMs,
      present: !!filtered,
      enter: victoryCandidate,
      hold: victoryCandidate,
      blocked: fistCandidate || context.manualInputLocked === true,
    });
    if (reset.length) {
      const cancelled = this.intents(this.rotate.cancel(frame.captureTimeMs));
      cancelled.push(...this.endPoint(frame.captureTimeMs, 'CANCEL'));
      cancelled.push(
        ...this.intents(
          this.zoom.cancel(frame.captureTimeMs),
          { x: 0, y: 0 },
          'ZOOM',
          this.pinchConfidence,
        ),
      );
      this.filter.reset();
      this.pinchCandidate = false;
      return [
        ...cancelled,
        ...this.intents(reset, { x: 0, y: 0 }, 'RESET', this.victoryScore),
      ];
    }
    this.pinchRatio = filtered?.pinchRatio;
    this.pinchConfidence = selected?.quality ?? 0;
    const pinch = pinchConditions(
      filtered?.pinchRatio ?? Infinity,
      selected?.features,
      this.config,
    );
    this.pinchCandidate = !fistCandidate && !victoryCandidate && pinch.enter;
    const zoomTransitions = this.zoom.step({
      atMs: frame.captureTimeMs,
      present: !!filtered,
      enter: this.pinchCandidate,
      hold: !fistCandidate && !victoryCandidate && !!filtered && pinch.hold,
    });
    if (zoomTransitions.some((t) => t.phase === 'START')) {
      const cancelled = this.intents(this.rotate.cancel(frame.captureTimeMs));
      cancelled.push(...this.endPoint(frame.captureTimeMs, 'CANCEL'));
      return [
        ...cancelled,
        ...this.intents(
          zoomTransitions,
          { x: 0, y: 0 },
          'ZOOM',
          this.pinchConfidence,
        ),
      ];
    }
    if (
      zoomTransitions.length ||
      ['ACTIVE', 'RELEASING'].includes(this.zoom.getState().phase)
    ) {
      return [
        ...this.endPoint(frame.captureTimeMs, 'CANCEL'),
        ...this.intents(
          zoomTransitions,
          { x: 0, y: filtered ? zoomDelta(filtered, this.config) : 0 },
          'ZOOM',
          this.pinchConfidence,
        ),
      ];
    }
    const pointBlocked =
      fistCandidate || victoryCandidate || this.pinchCandidate;
    const point =
      !!filtered &&
      !pointBlocked &&
      this.pointScore >= this.config.point.enterScore;
    if (point) {
      const phase = this.pointActive ? 'UPDATE' : 'START';
      const cancelled = this.intents(this.rotate.cancel(frame.captureTimeMs));
      this.pointActive = true;
      return [
        ...cancelled,
        ...this.intents(
          [{ phase, atMs: frame.captureTimeMs }],
          { x: 0, y: 0 },
          'SELECT',
          this.pointScore,
          { x: filtered.pointer.x, y: filtered.pointer.y },
        ),
      ];
    }
    const pointEnd = this.endPoint(
      frame.captureTimeMs,
      pointBlocked ? 'CANCEL' : 'END',
    );
    const transitions = this.rotate.step({
      atMs: frame.captureTimeMs,
      present: !!filtered,
      enter:
        !!filtered &&
        !fistCandidate &&
        !victoryCandidate &&
        !this.pinchCandidate &&
        this.score >= this.config.openPalm.enterScore,
      hold:
        !!filtered &&
        !fistCandidate &&
        !victoryCandidate &&
        !this.pinchCandidate &&
        this.score >= this.config.openPalm.holdScore,
    });
    return [
      ...pointEnd,
      ...this.intents(
        transitions,
        filtered ? rotateDelta(filtered, this.config) : { x: 0, y: 0 },
      ),
    ];
  }
}

export type GestureDebugState = ReturnType<GestureEngine['getDebugState']>;
