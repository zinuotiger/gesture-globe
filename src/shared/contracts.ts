export type SchemaVersion = 1;
export type GeoCoordinate = Readonly<{ lat: number; lon: number }>;
export type ModuleId =
  | 'M01'
  | 'M02'
  | 'M03'
  | 'M04'
  | 'M05'
  | 'M06'
  | 'M07'
  | 'M08'
  | 'M09'
  | 'M10'
  | 'M11'
  | 'M12';
export type NormalizedPoint = Readonly<{ x: number; y: number; z: number }>;
export interface GestureCategoryDto {
  name: string;
  score: number;
}
export interface HandObservation {
  localId: string;
  handedness: 'Left' | 'Right' | 'Unknown';
  handednessScore: number;
  gestures: readonly GestureCategoryDto[];
  landmarks: readonly NormalizedPoint[];
  worldLandmarks?: readonly NormalizedPoint[];
  bbox: Readonly<{ x: number; y: number; width: number; height: number }>;
}
export interface VisionFrame {
  schemaVersion: SchemaVersion;
  sessionId: string;
  frameId: number;
  captureTimeMs: number;
  resultTimeMs: number;
  inferenceMs: number;
  source: Readonly<{ width: number; height: number }>;
  hands: readonly HandObservation[];
}
export type GestureIntentKind =
  'NONE' | 'ROTATE' | 'ZOOM' | 'PAUSE' | 'SELECT' | 'RESET';
export type IntentPhase = 'START' | 'UPDATE' | 'END' | 'CANCEL' | 'TRIGGER';
export type InputSource = 'gesture' | 'mouse' | 'keyboard' | 'ui' | 'agent';
export interface GestureIntent {
  schemaVersion: SchemaVersion;
  id: string;
  sessionId: string;
  source: 'gesture';
  sourceHandId: string;
  kind: GestureIntentKind;
  phase: IntentPhase;
  timestampMs: number;
  confidence: number;
  traceId?: string;
  delta?: Readonly<{ x: number; y: number }>;
  pointer?: Readonly<{ x: number; y: number }>;
  debug?: Readonly<{ candidate: string; stableFrames: number }>;
}
export interface InputIntent<T = unknown> {
  schemaVersion: SchemaVersion;
  id: string;
  source: InputSource;
  kind: string;
  phase: IntentPhase;
  timestampMs: number;
  payload: T;
  traceId?: string;
}
interface CommandMetadata {
  schemaVersion: SchemaVersion;
  id: string;
  at: number;
  traceId?: string;
}
export type GlobeCommand = CommandMetadata &
  (
    | { type: 'ROTATE'; yaw: number; pitch: number; dt: number }
    | { type: 'ZOOM'; delta: number; dt: number }
    | { type: 'RESET_VIEW'; durationMs?: number }
    | { type: 'FOCUS_GEO'; lat: number; lon: number; distance?: number }
    | { type: 'SET_AUTOROTATE'; enabled: boolean }
    | { type: 'CANCEL_TRANSITION' }
  );
export interface ViewState {
  schemaVersion: SchemaVersion;
  azimuth: number;
  polar: number;
  distance: number;
  target: Readonly<{ x: number; y: number; z: number }>;
  autoRotate: boolean;
  transition: 'IDLE' | 'RESET' | 'FOCUS';
}
export interface GeoSelection {
  schemaVersion: SchemaVersion;
  selectionId: string;
  selectedAtMs: number;
  latitude: number;
  longitude: number;
  nearestCity?: Readonly<{
    id: string;
    name: string;
    countryOrRegion: string;
    distanceKm: number;
  }>;
}
export interface CityRecord {
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  countryOrRegion: string;
  latitude: number;
  longitude: number;
  aliases?: readonly string[];
  populationBand?: 'GLOBAL' | 'REGIONAL' | 'LOCAL';
}
export interface AssetEntry {
  id: string;
  kind: 'model' | 'wasm' | 'texture' | 'data' | 'font';
  url: string;
  version: string;
  sha256?: string;
  licenseId: string;
  required: boolean;
  fallbackId?: string;
}
export interface EventEnvelope<TType extends string, TPayload> {
  schemaVersion: SchemaVersion;
  eventId: string;
  type: TType;
  atMs: number;
  source: ModuleId;
  sessionId?: string;
  traceId?: string;
  payload: Readonly<TPayload>;
}
export interface Disposable {
  dispose(): void | Promise<void>;
}
export interface ObservableState<T> {
  getState(): Readonly<T>;
  subscribe(fn: (value: Readonly<T>) => void): () => void;
}
