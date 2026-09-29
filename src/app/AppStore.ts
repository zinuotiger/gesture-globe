import { mergeError, type ErrorRecord } from './errorState.ts';
import {
  defaultPreferences,
  parsePreferences,
  type Preferences,
} from './Preferences.ts';
import type { AppConfig, QualityLevel } from '../config/index.ts';
import {
  isPlainDto,
  type AppError,
  type GeoSelection,
  type GestureIntentKind,
  type InputSource,
  type ViewState,
} from '../shared/index.ts';

export type CameraStatus =
  'OFF' | 'REQUESTING' | 'STARTING' | 'STREAMING' | 'INTERRUPTED' | 'ERROR';
export type VisionStatus =
  'OFF' | 'INITIALIZING' | 'READY' | 'PAUSED' | 'RESTARTING' | 'ERROR';
export type HandStatus = 'UNKNOWN' | 'NO_HAND' | 'UNREADY' | 'READY';
export type GestureStatus =
  'IDLE' | 'CANDIDATE' | 'ACTIVE' | 'RELEASING' | 'PAUSED' | 'COOLDOWN';
export interface AppState {
  readonly schemaVersion: 1;
  readonly sessionId: string | null;
  readonly operationId: string | null;
  readonly appPhase:
    | 'BOOT'
    | 'GLOBE_READY'
    | 'CAMERA_REQUESTING'
    | 'VISION_LOADING'
    | 'GESTURE_READY'
    | 'ACTIVE'
    | 'DEGRADED'
    | 'FATAL'
    | 'DISPOSING';
  readonly cameraStatus: CameraStatus;
  readonly visionStatus: VisionStatus;
  readonly handStatus: HandStatus;
  readonly gesture: Readonly<{
    status: GestureStatus;
    kind: GestureIntentKind;
    confidence: number;
    candidate: string;
  }>;
  readonly control: Readonly<{
    source: InputSource | 'NONE';
    lockUntilMs: number;
  }>;
  readonly selection: Readonly<{
    status: 'NONE' | 'AIMING' | 'DWELLING' | 'SELECTED' | 'ERROR';
    value?: Readonly<GeoSelection>;
    progress: number;
    cityStatus: string;
  }>;
  readonly view: Readonly<ViewState>;
  readonly qualityLevel: QualityLevel;
  readonly preferences: Readonly<Preferences>;
  readonly errors: readonly ErrorRecord[];
  readonly diagnostics: Readonly<{ stateViolations: number }>;
}
type Envelope = { atMs: number };
type Session = { sessionId: string; operationId: string };
export type AppAction = Envelope &
  (
    | { type: 'APP_BOOTSTRAPPED'; available: boolean }
    | ({ type: 'GESTURE_ENABLE_REQUESTED' } & Session)
    | { type: 'CAMERA_STATE_CHANGED'; status: CameraStatus }
    | ({ type: 'VISION_STATE_CHANGED'; status: VisionStatus } & Session)
    | ({
        type: 'VISION_FRAME_APPLIED' | 'GESTURE_INTENT_EMITTED';
        hand: HandStatus;
        gesture: AppState['gesture'];
      } & Session)
    | {
        type: 'CONTROL_SOURCE_LOCKED';
        source: InputSource | 'NONE';
        lockUntilMs: number;
      }
    | { type: 'GLOBE_VIEW_CHANGED'; view: Readonly<ViewState> }
    | { type: 'SELECTION_PROGRESS_CHANGED'; progress: number }
    | {
        type: 'SELECTION_COMMITTED';
        value: Readonly<GeoSelection> | null;
        cityStatus: string;
      }
    | { type: 'QUALITY_CHANGED'; value: QualityLevel }
    | { type: 'PREFERENCES_CHANGED'; value: Readonly<Preferences> }
    | { type: 'ERROR_RAISED'; error: Readonly<AppError> }
    | { type: 'ERROR_RESOLVED'; code: AppError['code'] }
    | { type: 'GESTURE_DISABLE_REQUESTED' | 'APP_DISPOSED' }
  );
const idle = () =>
  Object.freeze({
    status: 'IDLE' as const,
    kind: 'NONE' as const,
    confidence: 0,
    candidate: 'None',
  });
const noControl = () =>
  Object.freeze({ source: 'NONE' as const, lockUntilMs: 0 });
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Finite serializable application state only. No media, model, DOM or renderer objects. */
export class AppStore {
  private state: AppState;
  private time = 0;
  private globeAvailable = true;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly config: Readonly<AppConfig>) {
    this.state = freeze({
      schemaVersion: 1,
      sessionId: null,
      operationId: null,
      appPhase: 'BOOT',
      cameraStatus: 'OFF',
      visionStatus: 'OFF',
      handStatus: 'UNKNOWN',
      gesture: idle(),
      control: noControl(),
      selection: { status: 'NONE', progress: 0, cityStatus: 'EMPTY' },
      view: {
        schemaVersion: 1,
        azimuth: config.globe.initialAzimuth,
        polar: config.globe.initialPolar,
        distance: config.globe.initialDistance,
        target: { x: 0, y: 0, z: 0 },
        autoRotate: config.app.autoRotateOnStart,
        transition: 'IDLE',
      },
      qualityLevel: config.app.defaultQuality,
      preferences: defaultPreferences(config),
      errors: [],
      diagnostics: { stateViolations: 0 },
    });
  }
  getState() {
    return this.state;
  }
  subscribe<T>(
    selector: (state: AppState) => T,
    listener: (value: T) => void,
    equals: (a: T, b: T) => boolean = Object.is,
  ) {
    let value = selector(this.state);
    const update = () => {
      const next = selector(this.state);
      if (!equals(value, next)) {
        value = next;
        listener(value);
      }
    };
    this.listeners.add(update);
    listener(value);
    return () => {
      this.listeners.delete(update);
    };
  }
  dispatch(action: AppAction): boolean {
    if (this.state.appPhase === 'DISPOSING') return false;
    if (
      !action ||
      typeof action !== 'object' ||
      !isPlainDto(action) ||
      !Number.isFinite(action.atMs) ||
      action.atMs < this.time
    )
      return this.violation();
    this.time = action.atMs;
    action = freeze(structuredClone(action));
    const previous = this.state;
    let next: AppState = { ...previous };
    const sessionMatches = () =>
      'sessionId' in action &&
      action.sessionId === previous.sessionId &&
      action.operationId === previous.operationId;
    switch (action.type) {
      case 'APP_BOOTSTRAPPED':
        this.globeAvailable = action.available;
        next = {
          ...next,
          appPhase: action.available ? 'GLOBE_READY' : 'DEGRADED',
        };
        break;
      case 'GESTURE_ENABLE_REQUESTED':
        if (
          !action.sessionId ||
          !action.operationId ||
          !['STREAMING', 'INTERRUPTED'].includes(previous.cameraStatus)
        )
          return this.violation();
        next = {
          ...next,
          sessionId: action.sessionId,
          operationId: action.operationId,
          visionStatus: 'INITIALIZING',
          handStatus: 'UNKNOWN',
          gesture: idle(),
          control: noControl(),
          selection: {
            ...next.selection,
            progress: 0,
            status: next.selection.value ? 'SELECTED' : 'NONE',
          },
        };
        break;
      case 'CAMERA_STATE_CHANGED':
        if (
          ![
            'OFF',
            'REQUESTING',
            'STARTING',
            'STREAMING',
            'INTERRUPTED',
            'ERROR',
          ].includes(action.status)
        )
          return this.violation();
        next = { ...next, cameraStatus: action.status };
        if (!['STREAMING', 'INTERRUPTED'].includes(action.status))
          next = {
            ...next,
            sessionId: null,
            operationId: null,
            visionStatus: 'OFF',
            handStatus: 'UNKNOWN',
            gesture: idle(),
          };
        break;
      case 'VISION_STATE_CHANGED':
        if (
          !sessionMatches() ||
          ![
            'OFF',
            'INITIALIZING',
            'READY',
            'PAUSED',
            'RESTARTING',
            'ERROR',
          ].includes(action.status)
        )
          return this.violation();
        next = { ...next, visionStatus: action.status };
        break;
      case 'VISION_FRAME_APPLIED':
      case 'GESTURE_INTENT_EMITTED':
        if (
          !sessionMatches() ||
          !['UNKNOWN', 'NO_HAND', 'UNREADY', 'READY'].includes(action.hand) ||
          ![
            'IDLE',
            'CANDIDATE',
            'ACTIVE',
            'RELEASING',
            'PAUSED',
            'COOLDOWN',
          ].includes(action.gesture.status) ||
          !['NONE', 'ROTATE', 'ZOOM', 'PAUSE', 'SELECT', 'RESET'].includes(
            action.gesture.kind,
          ) ||
          previous.visionStatus !== 'READY' ||
          previous.cameraStatus !== 'STREAMING' ||
          action.gesture.confidence < 0 ||
          action.gesture.confidence > 1 ||
          (['ACTIVE', 'PAUSED', 'COOLDOWN'].includes(action.gesture.status) &&
            action.hand !== 'READY')
        )
          return this.violation();
        next = { ...next, handStatus: action.hand, gesture: action.gesture };
        break;
      case 'CONTROL_SOURCE_LOCKED':
        if (
          action.lockUntilMs < 0 ||
          (previous.appPhase === 'FATAL' && action.source !== 'NONE')
        )
          return this.violation();
        next = {
          ...next,
          control: { source: action.source, lockUntilMs: action.lockUntilMs },
        };
        break;
      case 'GLOBE_VIEW_CHANGED':
        next = { ...next, view: action.view };
        break;
      case 'SELECTION_PROGRESS_CHANGED':
        if (
          action.progress < 0 ||
          action.progress > 1 ||
          (action.progress > 0 &&
            (next.gesture.kind !== 'SELECT' ||
              next.gesture.status !== 'ACTIVE'))
        )
          return this.violation();
        next = {
          ...next,
          selection: {
            ...next.selection,
            progress: action.progress,
            status:
              action.progress > 0
                ? 'DWELLING'
                : next.selection.value
                  ? 'SELECTED'
                  : 'NONE',
          },
        };
        break;
      case 'SELECTION_COMMITTED':
        if (
          action.value &&
          (action.value.schemaVersion !== 1 ||
            !action.value.selectionId ||
            Math.abs(action.value.latitude) > 90 ||
            action.value.longitude < -180 ||
            action.value.longitude >= 180)
        )
          return this.violation();
        next = {
          ...next,
          selection: {
            status: action.value ? 'SELECTED' : 'NONE',
            ...(action.value ? { value: action.value } : {}),
            progress: 0,
            cityStatus: action.cityStatus,
          },
        };
        break;
      case 'QUALITY_CHANGED':
        if (!['LOW', 'MEDIUM', 'HIGH', 'AUTO'].includes(action.value))
          return this.violation();
        next = { ...next, qualityLevel: action.value };
        break;
      case 'PREFERENCES_CHANGED':
        try {
          next = { ...next, preferences: parsePreferences(action.value) };
        } catch {
          return this.violation();
        }
        break;
      case 'ERROR_RAISED':
        if (
          action.error.schemaVersion !== 1 ||
          !action.error.id ||
          !action.error.code ||
          !Number.isFinite(action.error.atMs) ||
          action.error.atMs < 0 ||
          !['INFO', 'WARNING', 'ERROR', 'FATAL'].includes(action.error.severity)
        )
          return this.violation();
        next = {
          ...next,
          errors: mergeError(
            next.errors,
            action.error,
            action.atMs,
            this.config.ui.errorDedupeMs,
            this.config.ui.errorCapacity,
          ),
        };
        if (action.error.severity === 'FATAL')
          next = { ...next, appPhase: 'FATAL' };
        break;
      case 'ERROR_RESOLVED':
        next = {
          ...next,
          errors: next.errors.filter((e) => e.code !== action.code),
        };
        break;
      case 'GESTURE_DISABLE_REQUESTED':
        next = {
          ...next,
          sessionId: null,
          operationId: null,
          cameraStatus: 'OFF',
          visionStatus: 'OFF',
          handStatus: 'UNKNOWN',
          gesture: idle(),
        };
        break;
      case 'APP_DISPOSED':
        next = {
          ...next,
          appPhase: 'DISPOSING',
          sessionId: null,
          operationId: null,
          cameraStatus: 'OFF',
          visionStatus: 'OFF',
          handStatus: 'UNKNOWN',
          gesture: idle(),
          control: noControl(),
        };
        break;
      default:
        return this.violation();
    }
    if (next.visionStatus !== 'READY' || next.cameraStatus !== 'STREAMING')
      next = { ...next, gesture: idle(), handStatus: 'UNKNOWN' };
    if (['mouse', 'keyboard', 'ui'].includes(next.control.source))
      next = { ...next, gesture: idle() };
    if (next.visionStatus !== 'READY' && next.control.source === 'gesture')
      next = { ...next, control: noControl() };
    if (next.gesture.kind !== 'SELECT' || next.gesture.status !== 'ACTIVE')
      next = {
        ...next,
        selection: {
          ...next.selection,
          progress: 0,
          status: next.selection.value ? 'SELECTED' : 'NONE',
        },
      };
    if (next.appPhase === 'FATAL' || next.appPhase === 'DISPOSING')
      next = { ...next, control: noControl(), gesture: idle() };
    else
      next = {
        ...next,
        appPhase:
          !this.globeAvailable ||
          next.cameraStatus === 'ERROR' ||
          next.visionStatus === 'ERROR'
            ? 'DEGRADED'
            : next.cameraStatus === 'REQUESTING'
              ? 'CAMERA_REQUESTING'
              : ['INITIALIZING', 'RESTARTING'].includes(next.visionStatus)
                ? 'VISION_LOADING'
                : next.gesture.status === 'ACTIVE'
                  ? 'ACTIVE'
                  : next.visionStatus === 'READY'
                    ? 'GESTURE_READY'
                    : action.type === 'APP_BOOTSTRAPPED' && !action.available
                      ? 'DEGRADED'
                      : 'GLOBE_READY',
      };
    if (previous.appPhase === 'FATAL' && next.appPhase !== 'DISPOSING')
      next = {
        ...next,
        appPhase: 'FATAL',
        gesture: idle(),
        control: noControl(),
      };
    // Preserve unchanged slice identities for independent subscriptions.
    const shared = { ...next };
    for (const key of Object.keys(shared) as (keyof AppState)[]) {
      if (JSON.stringify(next[key]) === JSON.stringify(previous[key]))
        Object.assign(shared, { [key]: previous[key] });
    }
    this.state = Object.keys(shared).every(
      (key) =>
        shared[key as keyof AppState] === previous[key as keyof AppState],
    )
      ? previous
      : freeze(shared);
    this.notify();
    return true;
  }
  private violation(): false {
    this.recordViolation();
    this.notify();
    return false;
  }
  private recordViolation(): void {
    const count = this.state.diagnostics.stateViolations + 1;
    this.state = freeze({
      ...this.state,
      diagnostics: { stateViolations: count },
      errors: mergeError(
        this.state.errors,
        {
          schemaVersion: 1 as const,
          id: 'state-invariant',
          code: 'E-APP-STATE-001' as const,
          module: 'M01' as const,
          severity: 'WARNING' as const,
          recoverable: true,
          retryPolicy: 'NONE' as const,
          messageKey: 'app.invalidState',
          atMs: this.time,
        },
        this.time,
        this.config.ui.errorDedupeMs,
        this.config.ui.errorCapacity,
      ),
    });
  }
  private notify() {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        this.recordViolation();
      }
    }
  }
  dispose() {
    this.listeners.clear();
  }
}
export const selectPrivacy = (state: AppState) =>
  ['STREAMING', 'INTERRUPTED'].includes(state.cameraStatus)
    ? 'LOCAL_PROCESSING'
    : 'CAMERA_OFF';
export const selectCanGesture = (state: AppState) =>
  state.cameraStatus === 'STREAMING' &&
  state.visionStatus === 'READY' &&
  state.appPhase !== 'FATAL' &&
  state.appPhase !== 'DISPOSING';
export const selectLocation = (state: AppState) => state.selection;
