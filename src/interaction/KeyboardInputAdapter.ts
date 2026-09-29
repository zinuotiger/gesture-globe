import type { DispatchResult } from './input.types.ts';

export interface ShortcutKey {
  key: string;
  repeat: boolean;
  isComposing: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  defaultPrevented: boolean;
}
export function shortcutAction(
  event: ShortcutKey,
  protectedFocus: boolean,
): string | undefined {
  if (
    protectedFocus ||
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return undefined;
  const actions: Record<string, string> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    '+': 'in',
    '-': 'out',
    r: 'reset',
    R: 'reset',
    Escape: 'cancel',
  };
  const action = actions[event.key];
  return event.repeat && (action === 'reset' || action === 'cancel')
    ? undefined
    : action;
}
const focusSelector =
  'input,textarea,select,button,a[href],[role="textbox"],[role="combobox"],[role="slider"],[role="spinbutton"],[role="listbox"],[contenteditable]:not([contenteditable="false"])';

/** Bubble-phase only: focused widgets and already-consumed/IME/modifier keys retain their native behavior. */
export function bindKeyboardInput(
  document: Document,
  send: (action: string) => DispatchResult | undefined,
  consumeEscape: () => boolean = () => false,
) {
  const listener = (event: KeyboardEvent) => {
    const ElementClass = document.defaultView?.Element;
    const path = [...event.composedPath(), document.activeElement];
    const protectedFocus =
      !!ElementClass &&
      path.some(
        (target) =>
          target instanceof ElementClass && !!target.closest(focusSelector),
      );
    const action = shortcutAction(event, protectedFocus);
    if (!action) return;
    if ((action === 'cancel' && consumeEscape()) || send(action)?.accepted)
      event.preventDefault();
  };
  document.addEventListener('keydown', listener);
  return () => document.removeEventListener('keydown', listener);
}
