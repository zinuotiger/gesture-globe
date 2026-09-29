import type { ModuleId } from './contracts.ts';

export type ErrorCode =
  | 'E-APP-BOOT-001'
  | 'E-APP-STATE-001'
  | 'E-APP-DISPOSE-001'
  | 'E-CAP-001'
  | 'E-CAP-002'
  | 'E-CAM-001'
  | 'E-CAM-002'
  | 'E-CAM-003'
  | 'E-CAM-004'
  | 'E-CAM-005'
  | 'E-CAM-006'
  | 'E-CAM-007'
  | 'E-VIS-001'
  | 'E-VIS-002'
  | 'E-VIS-003'
  | 'E-VIS-004'
  | 'E-VIS-005'
  | 'E-VIS-006'
  | 'E-GST-001'
  | 'E-GST-002'
  | 'E-INT-001'
  | 'E-INT-002'
  | 'E-GLB-001'
  | 'E-GLB-002'
  | 'E-GLB-003'
  | 'E-GEO-001'
  | 'E-GEO-002'
  | 'E-GEO-003'
  | 'E-UI-001'
  | 'E-CFG-001'
  | 'E-CFG-002'
  | 'E-OBS-001'
  | 'E-PERF-001'
  | 'E-PERF-002'
  | 'E-AGT-001'
  | 'E-AGT-002';
export interface AppError {
  schemaVersion: 1;
  id: string;
  code: ErrorCode;
  module: ModuleId;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'FATAL';
  recoverable: boolean;
  retryPolicy: 'NONE' | 'USER' | 'AUTO_ONCE';
  messageKey: string;
  atMs: number;
  sessionId?: string;
  operationId?: string;
  technical?: Readonly<{ name?: string; detail?: string }>;
}
export type Result<T, E = AppError> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: E }>;
export interface Startable<TOptions = void> {
  start(options: TOptions): Promise<Result<void>>;
}
export interface Stoppable {
  stop(reason?: string): Promise<void>;
}
