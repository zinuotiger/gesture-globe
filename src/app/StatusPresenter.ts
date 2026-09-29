import type { AppState } from './AppStore.ts';
/** One trailing snapshot; caller's render loop drives time, never a recognition timer. */
export class StatusPresenter {
  private pending: AppState | undefined;
  private previous: AppState | undefined;
  private lastAt = -Infinity;
  private disposed = false;
  constructor(
    private readonly hz: number,
    private readonly render: (state: AppState) => void,
  ) {
    if (!Number.isFinite(hz) || hz <= 0 || hz > 4)
      throw new RangeError('Status update limit is 4Hz');
  }
  offer(state: AppState) {
    if (!this.disposed) this.pending = state;
  }
  flush(atMs: number) {
    if (
      this.disposed ||
      !Number.isFinite(atMs) ||
      !this.pending ||
      atMs - this.lastAt < 1000 / this.hz
    )
      return;
    const next = this.pending;
    this.pending = undefined;
    if (this.previous === next) return;
    this.previous = next;
    this.lastAt = atMs;
    this.render(next);
  }
  dispose() {
    this.disposed = true;
    this.pending = undefined;
    this.previous = undefined;
  }
}
