import type { AppState } from './AppStore.ts';
import { gestureFeedbackText } from '../ui/index.ts';
/** Candidate coalescing is display-only; active intents bypass the candidate throttle. */
export class GestureFeedbackPresenter {
  private lastAt = -Infinity;
  private pending: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  constructor(
    private readonly hz: number,
    private readonly candidate: (text: string) => void,
    private readonly effective: (text: string) => void,
    private readonly now = () => performance.now(),
  ) {
    if (hz !== 10) throw new RangeError('Candidate feedback must use 10Hz');
  }
  offer(state: AppState) {
    if (this.disposed) return;
    const text = gestureFeedbackText(state);
    this.effective(text.effective);
    this.pending = text.candidate;
    const remaining = 1000 / this.hz - (this.now() - this.lastAt);
    if (remaining <= 0) this.flush();
    else
      this.timer ??= setTimeout(() => {
        this.timer = undefined;
        this.flush();
      }, remaining);
  }
  private flush() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.disposed || this.pending === undefined) return;
    this.candidate(this.pending);
    this.pending = undefined;
    this.lastAt = this.now();
  }
  dispose() {
    this.disposed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.pending = undefined;
  }
}
