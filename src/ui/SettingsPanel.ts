import type { Preferences, AppState } from '../app/index.ts';

/** UI receives plain state and emits settings actions; it owns no runtime resources. */
export function createSettingsPanel(
  document: Document,
  sensitivityRange: { min: number; max: number },
  change: (patch: Partial<Preferences>) => void,
  reset: () => void,
  stopCamera: () => void,
) {
  const element = document.createElement('details');
  element.className = 'settings-panel';
  const summary = document.createElement('summary');
  summary.textContent = '设置';
  const body = document.createElement('div');
  body.className = 'settings-body';
  const controls = new Map<
    keyof Preferences,
    HTMLInputElement | HTMLSelectElement
  >();
  const removers: (() => void)[] = [];
  const add = (
    key: keyof Preferences,
    labelText: string,
    control: HTMLInputElement | HTMLSelectElement,
  ) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    control.setAttribute('aria-label', labelText);
    label.append(control);
    body.append(label);
    controls.set(key, control);
    const changed = () =>
      change({
        [key]:
          control instanceof document.defaultView!.HTMLInputElement &&
          control.type === 'checkbox'
            ? control.checked
            : key === 'sensitivity'
              ? Number(control.value)
              : control.value,
      });
    control.addEventListener('change', changed);
    removers.push(() => control.removeEventListener('change', changed));
  };
  const quality = document.createElement('select');
  for (const [value, label] of [
    ['AUTO', '自动'],
    ['LOW', '低'],
    ['MEDIUM', '中'],
    ['HIGH', '高'],
  ]) {
    const option = document.createElement('option');
    option.value = value!;
    option.textContent = label!;
    quality.append(option);
  }
  add('quality', '设置画质', quality);
  for (const [key, text] of [
    ['showSkeleton', '显示手部骨架'],
    ['showPreview', '显示摄像头预览'],
    ['autoRotate', '自动旋转'],
    ['reducedMotion', '减少动画'],
    ['invertX', '反转水平手势'],
    ['invertY', '反转垂直手势'],
  ] as const) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    add(key, text, input);
  }
  const sensitivity = document.createElement('input');
  sensitivity.type = 'number';
  sensitivity.min = String(sensitivityRange.min);
  sensitivity.max = String(sensitivityRange.max);
  sensitivity.step = 'any';
  add('sensitivity', '手势灵敏度', sensitivity);
  const note = document.createElement('p');
  note.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'settings-actions';
  for (const [text, action] of [
    ['恢复默认设置', reset],
    ['关闭摄像头', stopCamera],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', action);
    removers.push(() => button.removeEventListener('click', action));
    actions.append(button);
  }
  body.append(note, actions);
  element.append(summary, body);
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !element.open) return;
    event.preventDefault();
    event.stopPropagation();
    element.open = false;
    summary.focus();
  };
  element.addEventListener('keydown', closeOnEscape);
  return {
    element,
    update(
      preferences: Readonly<Preferences>,
      state: AppState,
      systemReduced: boolean,
      storageAvailable: boolean,
    ) {
      for (const [key, control] of controls) {
        const value =
          key === 'autoRotate'
            ? state.view.autoRotate
            : key === 'quality'
              ? state.qualityLevel
              : preferences[key];
        if (
          control instanceof document.defaultView!.HTMLInputElement &&
          control.type === 'checkbox'
        )
          control.checked = Boolean(value);
        else if (control !== document.activeElement)
          control.value = String(value);
      }
      controls.get('autoRotate')!.disabled =
        systemReduced || preferences.reducedMotion;
      note.textContent = [
        systemReduced ? '系统已要求减少动画，自动旋转已关闭。' : '',
        !storageAvailable ? '设置仅在本次会话有效，浏览器存储不可用。' : '',
        '灵敏度只调整旋转和缩放幅度，不改变识别阈值。',
      ]
        .filter(Boolean)
        .join(' ');
    },
    dispose() {
      element.removeEventListener('keydown', closeOnEscape);
      for (const remove of removers) remove();
      element.remove();
    },
  };
}
