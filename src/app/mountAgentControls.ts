import type { AppConfig } from '../config/index.ts';
import type { AgentControlPort } from '../shared/index.ts';
import { createAgentControls } from '../ui/index.ts';

/** Optional composition port; App does not import the Agent implementation. */
export function mountAgentControls(
  root: HTMLElement,
  port: AgentControlPort,
  config: Readonly<AppConfig>,
) {
  if (!config.features.agent) return { dispose() {} };
  const panel = createAgentControls(root.ownerDocument, port);
  root.append(panel.element);
  const window = root.ownerDocument.defaultView!;
  let frame: number | undefined,
    disposed = false,
    lastUi = -Infinity;
  const tick = (at: number) => {
    if (disposed) return;
    port.tick();
    if (at - lastUi >= 1000 / config.diagnostics.uiHz) {
      lastUi = at;
      panel.update(port.snapshot());
    }
    frame = window.requestAnimationFrame(tick);
  };
  const hidden = () => {
    if (root.ownerDocument.hidden) port.cancel();
  };
  root.ownerDocument.addEventListener('visibilitychange', hidden);
  panel.update(port.snapshot());
  frame = window.requestAnimationFrame(tick);
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      root.ownerDocument.removeEventListener('visibilitychange', hidden);
      port.dispose();
      panel.dispose();
    },
  };
}
