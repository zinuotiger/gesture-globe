import type { AppState } from '../app/index.ts';
export function gestureFeedbackText(state: AppState) {
  const labels: Record<string, string> = {
    Open_Palm: '张掌',
    Closed_Fist: '握拳',
    Pointing_Up: '指向',
    Victory: '胜利手势',
    Pinch: '捏合',
    NONE: '无',
  };
  const operations = {
    NONE: '等待手势',
    ROTATE: '旋转就绪 · 缓慢移动张开的手掌',
    ZOOM: '缩放就绪 · 保持捏合并上下移动',
    PAUSE: '握拳暂停',
    SELECT: '指向就绪 · 对准地球并稳住进度圈',
    RESET: '正在复位',
  };
  const manual = ['mouse', 'keyboard', 'ui'].includes(state.control.source);
  let effective = `当前操作：${operations[state.gesture.kind]}`;
  if (state.view.transition === 'RESET') effective = '当前操作：正在复位';
  else if (manual && state.gesture.kind !== 'NONE')
    effective = '姿势已识别 · 鼠标或按钮优先，手势暂不执行；松开后稍等';
  else if (
    state.gesture.kind !== 'NONE' &&
    state.gesture.kind !== 'PAUSE' &&
    state.control.source !== 'gesture'
  )
    effective = '姿势已识别 · 尚未取得控制，请先稳住手势';
  else if (state.gesture.kind === 'NONE') {
    if (state.handStatus === 'NO_HAND')
      effective = '等待手势 · 未检测到手，请把整只手放入预览';
    else if (state.handStatus === 'UNREADY')
      effective = '等待手势 · 已看到手，但位置不适合控制，请完整入框并调整距离';
    else if (state.gesture.status === 'CANDIDATE')
      effective = '等待手势稳定 · 已有候选，尚未执行';
    else if (state.gesture.status === 'COOLDOWN')
      effective = '复位手势冷却中 · 先放下或换姿势，再重新举 V';
    else if (state.handStatus === 'READY')
      effective = '等待手势 · 手已入框，当前姿势尚未满足触发条件';
  }
  return {
    candidate:
      state.gesture.status === 'CANDIDATE'
        ? `候选：${labels[state.gesture.candidate] ?? state.gesture.candidate} · 尚未执行`
        : '候选：无',
    effective,
  };
}
export function createGestureFeedback(document: Document) {
  const element = document.createElement('section');
  element.className = 'gesture-detail';
  element.setAttribute('aria-label', '手势反馈');
  const candidate = document.createElement('p'),
    effective = document.createElement('p');
  candidate.className = 'gesture-candidate';
  effective.className = 'gesture-effective';
  effective.setAttribute('aria-live', 'polite');
  element.append(candidate, effective);
  return {
    element,
    updateCandidate(text: string) {
      candidate.textContent = text;
    },
    updateEffective(text: string) {
      if (effective.textContent !== text) effective.textContent = text;
    },
    dispose() {
      element.remove();
    },
  };
}
