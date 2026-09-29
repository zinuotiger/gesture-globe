import type { AppState } from '../app/index.ts';

export function preparationText(state: AppState) {
  if (state.cameraStatus === 'OFF')
    return '摄像头未开启。主动启用后，才能检查手部位置和模型状态。';
  if (state.cameraStatus === 'REQUESTING')
    return '等待浏览器授权；可以拒绝或取消，并继续使用鼠标。';
  if (state.cameraStatus === 'ERROR' || state.cameraStatus === 'INTERRUPTED')
    return '摄像头暂时不可用；检查设备或授权，也可继续使用鼠标。';
  if (state.visionStatus === 'ERROR')
    return '本地手势模型未就绪；可关闭摄像头后重试，鼠标仍可使用。';
  if (state.visionStatus !== 'READY')
    return '正在准备本地识别。请把手腕与指尖完整放入画面，保持光线清楚。';
  if (state.handStatus === 'READY')
    return '模型已就绪，手部位置可用于控制。请继续保持完整入框、距离适中和光线清楚。';
  if (state.handStatus === 'UNREADY')
    return '已检测到手，但暂不适合控制。请完整露出手腕与指尖，并调整与摄像头的距离。';
  return '模型已就绪，请把整只手放入画面；不要贴近镜头，保持光线清楚。';
}

export function createOnboardingDialog(document: Document) {
  const dialog = document.createElement('dialog');
  dialog.className = 'onboarding-dialog';
  dialog.setAttribute('aria-label', '手势入门');
  const heading = document.createElement('h2');
  const content = document.createElement('div');
  const preparation = document.createElement('p');
  preparation.className = 'preparation-check';
  preparation.setAttribute('aria-live', 'polite');
  const controls = document.createElement('div');
  controls.className = 'onboarding-actions';
  const back = document.createElement('button'),
    next = document.createElement('button'),
    skip = document.createElement('button'),
    cancel = document.createElement('button');
  for (const button of [back, next, skip, cancel]) button.type = 'button';
  back.textContent = '上一步';
  controls.append(back, next, skip, cancel);
  dialog.append(heading, content, preparation, controls);
  let step = 0,
    trigger: HTMLElement | undefined,
    activate: (() => void) | undefined,
    finish: (() => void) | undefined;
  let state: AppState | undefined;
  function render() {
    heading.textContent = `${step + 1} / 3 · ${['本地处理与隐私', '认识五种手势', '准备开始'][step]}`;
    dialog.dataset.step = String(step + 1);
    content.replaceChildren();
    const lines =
      step === 0
        ? [
            '视频只在当前浏览器本地用于手部识别，不录制、不上传，也不请求麦克风。',
            '你可以随时关闭摄像头；隐藏预览不会停止摄像头。鼠标和键盘始终可用。',
          ]
        : step === 1
          ? [
              '张开手掌：旋转地球。先稳定手势，再缓慢移动。',
              '拇指与食指捏合：上下移动来缩放。不要快速贴近镜头。',
              '握拳：暂停手势控制。松开后重新选择动作。',
              '伸出食指：指向地球并停留选择地点。移到背景会取消进度。',
              'V 字手势：重置视角。保持姿势不会反复触发。',
            ]
          : [
              '把手腕和五个指尖完整放入预览，保持适中距离。',
              '准备一处光线清楚的环境，避免强烈背光。亮度体验仍需你自行确认。',
              '启用后请先缓慢移动手掌，确认地球响应；也可以随时返回鼠标操作。',
            ];
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      content.append(p);
    }
    preparation.hidden = step !== 2;
    if (state) preparation.textContent = preparationText(state);
    back.hidden = step === 0;
    next.textContent =
      step < 2 ? '下一步' : activate ? '启用并开始' : '完成帮助';
    skip.textContent = activate ? '跳过教学并启用' : '关闭帮助';
    cancel.textContent = activate ? '暂不开启' : '取消';
  }
  function close(complete: boolean) {
    const start = activate,
      onFinish = finish,
      focus = trigger;
    activate = finish = undefined;
    trigger = undefined;
    dialog.close();
    if (complete) onFinish?.();
    if (focus?.isConnected) focus.focus();
    if (complete) start?.();
  }
  const previous = () => {
    step = Math.max(0, step - 1);
    render();
    next.focus();
  };
  const advance = () => {
    if (step < 2) {
      step++;
      render();
      next.focus();
    } else close(true);
  };
  const skipGuide = () => close(true),
    cancelGuide = () => close(false);
  const cancelEvent = (event: Event) => {
    event.preventDefault();
    close(false);
  };
  const trapFocus = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && dialog.open) {
      event.preventDefault();
      event.stopPropagation();
      close(false);
      return;
    }
    if (event.key !== 'Tab' || !dialog.open) return;
    const focusable = [back, next, skip, cancel].filter(
      (button) => !button.hidden && !button.disabled,
    );
    const first = focusable[0]!,
      last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  back.addEventListener('click', previous);
  next.addEventListener('click', advance);
  skip.addEventListener('click', skipGuide);
  cancel.addEventListener('click', cancelGuide);
  dialog.addEventListener('cancel', cancelEvent);
  dialog.addEventListener('keydown', trapFocus);
  return {
    element: dialog,
    open(from: HTMLElement, completed: () => void, start?: () => void) {
      if (dialog.open) return;
      step = 0;
      trigger = from;
      finish = completed;
      activate = start;
      render();
      dialog.showModal();
      next.focus();
    },
    update(value: AppState) {
      state = value;
      if (dialog.open && step === 2)
        preparation.textContent = preparationText(value);
    },
    dispose() {
      activate = finish = undefined;
      if (dialog.open) dialog.close();
      back.removeEventListener('click', previous);
      next.removeEventListener('click', advance);
      skip.removeEventListener('click', skipGuide);
      cancel.removeEventListener('click', cancelGuide);
      dialog.removeEventListener('cancel', cancelEvent);
      dialog.removeEventListener('keydown', trapFocus);
      dialog.remove();
    },
  };
}
