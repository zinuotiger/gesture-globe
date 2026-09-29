import type { AppStore } from './AppStore.ts';
import type { AppConfig } from '../config/index.ts';
import { createErrorCenter, type RecoveryAction } from '../ui/index.ts';
import type { ErrorRecord } from './errorState.ts';
export function mountErrors(
  root: HTMLElement,
  store: AppStore,
  config: Readonly<AppConfig>,
  actions: Record<RecoveryAction, () => void | Promise<unknown>>,
  stopFatal: () => void,
) {
  const hidden = new Map<
    HTMLElement,
    { hidden: HTMLElement['hidden']; inert: boolean }
  >();
  const center = createErrorCenter(
    root.ownerDocument,
    config.configVersion,
    async (action: RecoveryAction, error: ErrorRecord) => {
      if (!store.getState().errors.some((e) => e.id === error.id)) return;
      await actions[action]();
    },
  );
  root.append(center.element);
  let fatal = false;
  const privacy = root.querySelector('.privacy');
  const privacyParent = privacy?.parentNode;
  const privacyNext = privacy?.nextSibling ?? null;
  const remove = store.subscribe(
    (state) => state.errors,
    (errors) => {
      center.update(errors);
      if (errors.some((e) => e.severity === 'FATAL') && !fatal) {
        fatal = true;
        // Stop resources before displaying a camera-off claim; never recursively dispose Store.
        stopFatal();
        if (privacy) center.element.append(privacy);
        for (const child of root.children)
          if (child instanceof HTMLElement && child !== center.element) {
            hidden.set(child, { hidden: child.hidden, inert: child.inert });
            child.hidden = true;
            child.inert = true;
          }
        center.element.tabIndex = -1;
        center.element.focus();
      }
    },
  );
  return {
    dispose() {
      remove();
      for (const [element, state] of hidden) {
        element.hidden = state.hidden;
        element.inert = state.inert;
      }
      if (privacy && privacyParent)
        privacyParent.insertBefore(privacy, privacyNext);
      center.dispose();
    },
  };
}
