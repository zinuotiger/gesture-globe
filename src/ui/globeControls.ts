/** Semantic buttons provide keyboard fallback without global shortcut interception. */
export function globeControls(
  document: Document,
  onAction: (action: string) => void,
) {
  const element = document.createElement('div');
  element.className = 'globe-controls';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', '地球备用控制');
  const removers: (() => void)[] = [];
  for (const [action, label, text] of [
    ['left', '向左旋转', '←'],
    ['right', '向右旋转', '→'],
    ['up', '向上旋转', '↑'],
    ['down', '向下旋转', '↓'],
    ['in', '放大地球', '＋'],
    ['out', '缩小地球', '−'],
    ['reset', '重置视角', '重置'],
    ['cancel', '取消过渡', '取消'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label!);
    button.textContent = text!;
    const activate = () => onAction(action!);
    button.addEventListener('click', activate);
    removers.push(() => button.removeEventListener('click', activate));
    element.append(button);
  }
  return {
    element,
    dispose() {
      removers.forEach((remove) => remove());
      element.remove();
    },
  };
}
