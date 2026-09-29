import { parseInputIntent } from './inputSchema.ts';
import type {
  ControlInputIntent,
  DispatchResult,
  InputPort,
} from './input.types.ts';
/** Single synchronous ingress. No queue, view mutation, locks or hidden retry. */
export class InputRouter implements InputPort {
  private disposed = false;
  constructor(private readonly handler: (intent: ControlInputIntent) => void) {}
  dispatch(value: unknown): DispatchResult {
    if (this.disposed) return { accepted: false, reason: 'DISPOSED' };
    let input: ControlInputIntent;
    try {
      input = parseInputIntent(value);
    } catch {
      return { accepted: false, reason: 'INVALID_INPUT' };
    }
    try {
      this.handler(input);
    } catch {
      return { accepted: false, reason: 'HANDLER_FAILED' };
    }
    return { accepted: true, reason: 'ACCEPTED' };
  }
  dispose(): void {
    this.disposed = true;
  }
}
