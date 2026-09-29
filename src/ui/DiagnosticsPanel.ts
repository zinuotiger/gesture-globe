export interface DiagnosticsView {
  summary: string;
  events: readonly string[];
}
/** Plain, already-redacted presentation only. Closed until explicit user action. */
export function createDiagnosticsPanel(
  document: Document,
  clear: () => void,
  stopCamera: () => void,
) {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.textContent = '打开诊断';
  const element = document.createElement('dialog');
  element.className = 'diagnostics-panel';
  element.setAttribute('aria-label', '运行诊断');
  const title = document.createElement('h2');
  title.textContent = '运行诊断';
  const note = document.createElement('p');
  note.textContent =
    '仅记录本次会话的脱敏指标和事件，不保存视频或手部点。延迟为渲染提交估计，尚非真人验收结果。';
  const summary = document.createElement('pre');
  summary.className = 'diagnostics-metrics';
  const events = document.createElement('pre');
  events.className = 'diagnostics-events';
  const actions = document.createElement('div');
  const removers: (() => void)[] = [];
  for (const [label, action] of [
    ['清空会话事件', clear],
    [
      '停止摄像头并关闭诊断',
      () => {
        stopCamera();
        element.close();
      },
    ],
    ['关闭诊断', () => element.close()],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    removers.push(() => button.removeEventListener('click', action));
    actions.append(button);
  }
  element.append(title, note, actions, summary, events);
  const open = () => {
    if (!element.open) element.showModal();
  };
  const closed = () => trigger.focus();
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      element.close();
    }
    if (event.key === 'Tab') {
      const buttons = [...actions.querySelectorAll('button')];
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons.at(-1)!.focus();
      } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault();
        buttons[0]!.focus();
      }
    }
  };
  trigger.addEventListener('click', open);
  element.addEventListener('close', closed);
  element.addEventListener('keydown', key);
  return {
    trigger,
    element,
    isOpen: () => element.open,
    update(view: DiagnosticsView) {
      if (!element.open) return;
      summary.textContent = view.summary;
      events.textContent = view.events.join('\n');
    },
    dispose() {
      trigger.removeEventListener('click', open);
      element.removeEventListener('close', closed);
      element.removeEventListener('keydown', key);
      for (const remove of removers) remove();
      element.remove();
      trigger.remove();
    },
  };
}
