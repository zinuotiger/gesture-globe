import type { AppState } from '../app/index.ts';

export function topStatusText(state: AppState): string {
  const camera = {
    OFF: '关闭',
    REQUESTING: '等待授权',
    STARTING: '准备中',
    STREAMING: '开启',
    INTERRUPTED: '中断',
    ERROR: '不可用',
  }[state.cameraStatus];
  const vision = {
    OFF: '未运行',
    INITIALIZING: '加载中',
    READY: '就绪',
    PAUSED: '暂停',
    RESTARTING: '恢复中',
    ERROR: '不可用',
  }[state.visionStatus];
  const hand = {
    UNKNOWN: '未知',
    NO_HAND: '未检测到',
    UNREADY: '请调整位置',
    READY: '就绪',
  }[state.handStatus];
  const kind = {
    NONE: '无',
    ROTATE: '旋转',
    ZOOM: '缩放',
    PAUSE: '握拳暂停',
    SELECT: '指向',
    RESET: '重置',
  }[state.gesture.kind];
  const source = {
    NONE: '待命',
    mouse: '鼠标',
    keyboard: '键盘',
    ui: '页面按钮',
    gesture: '手势',
    agent: 'Agent',
  }[state.control.source];
  const gesture =
    state.gesture.status === 'CANDIDATE'
      ? '候选，尚未执行'
      : state.gesture.status === 'IDLE'
        ? '等待'
        : kind;
  return `摄像头：${camera} · 识别：${vision} · 手：${hand} · 手势：${gesture} · 控制：${source}`;
}
export function createTopStatusBar(document: Document) {
  const element = document.createElement('section');
  element.className = 'top-status-bar';
  element.setAttribute('aria-label', '运行状态');
  element.setAttribute('aria-live', 'polite');
  return {
    element,
    update(state: AppState) {
      element.textContent = topStatusText(state);
      element.dataset.appPhase = state.appPhase;
    },
    dispose() {
      element.remove();
    },
  };
}
