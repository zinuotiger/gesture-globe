import type { AppConfig } from '../config/index.ts';
import { GestureEngine } from '../gesture/index.ts';
import { gestureToInput, type CommandBus } from '../interaction/index.ts';
import type { VisionFrame } from '../shared/index.ts';
import { isVisionFrame } from '../vision/index.ts';
import type { IntentTiming } from '../diagnostics/index.ts';
import {
  defaultPreferences,
  parsePreferences,
  transformGesturePreference,
  type Preferences,
} from './Preferences.ts';

/** Session-scoped DTO → pure gesture → owned command bus. No camera or model objects. */
export class GesturePipeline {
  private readonly engine: GestureEngine;
  private session: string | undefined;
  private previousTime: number | undefined;
  private frameId = -1;
  private accepted = 0;
  private rejected = 0;
  private observedHands = 0;
  private observerErrors = 0;
  private preferences: Readonly<Preferences>;
  constructor(
    private readonly config: Readonly<AppConfig>,
    private readonly bus: CommandBus,
    private readonly now: () => number,
    private readonly observeIntent: (
      inputId: string,
      value: Readonly<IntentTiming>,
    ) => void = () => {},
  ) {
    this.engine = new GestureEngine(config);
    this.preferences = defaultPreferences(config);
  }
  setPreferences(preferences: Readonly<Preferences>) {
    this.preferences = parsePreferences(preferences);
  }
  start(sessionId: string): void {
    if (!sessionId.trim()) throw new TypeError('Session is required');
    this.stop('SESSION_CHANGED');
    this.session = sessionId;
  }
  accept(frame: VisionFrame) {
    const time = this.now();
    if (
      !isVisionFrame(frame) ||
      !this.session ||
      frame.sessionId !== this.session ||
      frame.frameId <= this.frameId ||
      !Number.isFinite(frame.captureTimeMs) ||
      frame.captureTimeMs > time ||
      time - frame.captureTimeMs > this.config.vision.staleFrameMs ||
      (this.previousTime !== undefined &&
        frame.captureTimeMs <= this.previousTime)
    ) {
      this.rejected++;
      this.bus.cancelSource('gesture', 'REJECTED_FRAME');
      return [];
    }
    const dt =
      this.previousTime === undefined
        ? 0
        : (frame.captureTimeMs - this.previousTime) / 1000;
    this.previousTime = frame.captureTimeMs;
    this.observedHands = frame.hands.length;
    this.frameId = frame.frameId;
    const owner = this.bus.getState().owner;
    const intents = this.engine.update(frame, {
      manualInputLocked:
        owner === 'mouse' || owner === 'keyboard' || owner === 'ui',
    });
    const debug = this.engine.getDebugState();
    // Victory is a one-shot intent. Fresh held-pose frames sustain only its
    // current reset; never replay the command or extend a manual/other owner.
    if (debug.handPresent && debug.candidate === 'Victory')
      this.bus.renewGestureReset();
    this.accepted++;
    for (const intent of intents) {
      const input = gestureToInput(
        transformGesturePreference(intent, this.preferences, this.config),
        dt,
      );
      if (input) {
        if (
          (intent.phase === 'UPDATE' &&
            (intent.kind === 'ROTATE' || intent.kind === 'ZOOM')) ||
          (intent.phase === 'TRIGGER' && intent.kind === 'RESET')
        ) {
          try {
            this.observeIntent(input.id, {
              kind: intent.kind as IntentTiming['kind'],
              captureMs: frame.captureTimeMs,
              resultMs: frame.resultTimeMs,
              intentMs: this.now(),
            });
          } catch {
            this.observerErrors++;
          }
        }
        this.bus.dispatch(input);
      }
    }
    this.bus.setGesturePaused(this.engine.getDebugState().clutchPaused);
    return intents;
  }
  stop(reason = 'STOPPED'): void {
    this.engine.reset(reason);
    this.session = undefined;
    this.previousTime = undefined;
    this.frameId = -1;
    this.observedHands = 0;
    this.bus.cancelSource('gesture', reason);
    this.bus.setGesturePaused(false);
  }
  getState() {
    return Object.freeze({
      acceptedFrames: this.accepted,
      rejectedFrames: this.rejected,
      observedHands: this.observedHands,
      observerErrors: this.observerErrors,
      ...this.engine.getDebugState(),
    });
  }
}
