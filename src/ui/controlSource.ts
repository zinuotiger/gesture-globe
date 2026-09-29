import type { InputSource } from '../shared/index.ts';
const labels: Record<InputSource, string> = {
  mouse: '鼠标',
  keyboard: '键盘',
  ui: '页面按钮',
  gesture: '手势',
  agent: 'Agent',
};
export function controlSource(document: Document) {
  const element = document.createElement('span');
  element.className = 'control-source';
  element.setAttribute('aria-live', 'polite');
  const update = (source: InputSource | null) => {
    element.textContent = `当前控制：${source ? labels[source] : '待命'}`;
  };
  update(null);
  return { element, update };
}
