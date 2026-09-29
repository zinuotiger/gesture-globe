import { isPlainDto } from '../shared/index.ts';
export interface DiagnosticEvent {
  atMs: number;
  type: 'SOURCE' | 'COMMAND' | 'GESTURE' | 'ERROR' | 'HEALTH';
  module: string;
  code?: string;
  source?: string;
  command?: string;
  gesture?: string;
  state?: string;
  sessionId?: string;
  recoverable?: boolean;
}
const enums: Record<string, readonly string[]> = {
  type: ['SOURCE', 'COMMAND', 'GESTURE', 'ERROR', 'HEALTH'],
  source: ['NONE', 'mouse', 'keyboard', 'ui', 'gesture', 'agent'],
  command: [
    'ROTATE',
    'ZOOM',
    'RESET_VIEW',
    'FOCUS_GEO',
    'SET_AUTOROTATE',
    'CANCEL_TRANSITION',
  ],
  gesture: ['NONE', 'ROTATE', 'ZOOM', 'PAUSE', 'RESET', 'SELECT'],
  state: [
    'IDLE',
    'CANDIDATE',
    'ACTIVE',
    'RELEASING',
    'PAUSED',
    'COOLDOWN',
    'HEALTHY',
    'WARNING',
    'ACCEPTED',
    'REJECTED',
  ],
};
/** Fixed vocabulary and anonymous session ordinals only; no free-form messages. */
export class EventRingBuffer {
  private readonly events: (Readonly<DiagnosticEvent> | undefined)[];
  private next = 0;
  private count = 0;
  private rejected = 0;
  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new RangeError('Invalid event capacity');
    this.events = new Array(capacity);
  }
  record(value: Readonly<DiagnosticEvent>): boolean {
    const fields = [
      'atMs',
      'type',
      'module',
      'code',
      'source',
      'command',
      'gesture',
      'state',
      'sessionId',
      'recoverable',
    ];
    if (
      !value ||
      !isPlainDto(value) ||
      Object.keys(value).some((k) => !fields.includes(k)) ||
      !Number.isFinite(value.atMs) ||
      value.atMs < 0 ||
      !enums.type!.includes(value.type) ||
      !/^M(?:0[1-9]|1[0-2])$/.test(value.module) ||
      Object.entries(enums).some(
        ([key, allowed]) =>
          key in value &&
          !allowed.includes(value[key as keyof DiagnosticEvent] as string),
      ) ||
      (value.code !== undefined &&
        !/^E-[A-Z]{2,5}(?:-[A-Z]{2,10})?-\d{3}$/.test(value.code)) ||
      (value.sessionId !== undefined &&
        !/^session-\d{1,12}$/.test(value.sessionId)) ||
      (value.recoverable !== undefined &&
        typeof value.recoverable !== 'boolean')
    ) {
      this.rejected++;
      return false;
    }
    this.events[this.next] = Object.freeze({ ...value });
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
    return true;
  }
  snapshot() {
    return Object.freeze(
      Array.from(
        { length: this.count },
        (_, i) =>
          this.events[
            (this.next - this.count + i + this.capacity) % this.capacity
          ]!,
      ),
    );
  }
  getRejected() {
    return this.rejected;
  }
  clear() {
    this.events.fill(undefined);
    this.next = 0;
    this.count = 0;
  }
}
