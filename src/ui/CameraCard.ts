import { createCameraOverlay } from './CameraOverlay.ts';
export interface CameraResources {
  liveTracks: number;
  lastClosed: { total: number; ended: number } | null;
  videoAttached: boolean;
}
export function cameraResourceText(resources: CameraResources): string {
  const closed = resources.lastClosed
    ? `${resources.lastClosed.ended}/${resources.lastClosed.total}`
    : '尚无关闭记录';
  return `活动轨道：${resources.liveTracks}；最近释放轨道：${closed}；预览绑定：${resources.videoAttached ? '已连接' : '已解除'}`;
}
export function cameraPresentation(phase: string, previewVisible: boolean) {
  const live = ['ACTIVE', 'MUTED'].includes(phase);
  const pending = ['REQUESTING', 'WAITING'].includes(phase);
  return {
    live,
    pending,
    enableDisabled: live || pending,
    closeDisabled: !live && !pending,
    closeLabel: pending ? '取消授权等待' : '关闭摄像头',
    previewHidden: !live || !previewVisible,
    previewLabel: previewVisible ? '隐藏画面' : '显示画面',
    hiddenNotice: live && !previewVisible ? '画面已隐藏，摄像头仍开启。' : '',
  };
}
/** Plain display state only; application owns media and action wiring. */
export function createCameraCard(document: Document, mirror: boolean) {
  const section = document.createElement('section');
  section.className = 'camera-panel';
  section.setAttribute('aria-label', '摄像头控制');
  const button = (text: string) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = text;
    return node;
  };
  const enable = button('启用手势控制'),
    close = button('关闭摄像头'),
    toggle = button('隐藏画面'),
    skeleton = button('隐藏骨架');
  const overlay = createCameraOverlay(document);
  const preview = document.createElement('div');
  preview.className = 'camera-preview-frame';
  preview.hidden = true;
  const message = document.createElement('p');
  message.setAttribute('aria-live', 'polite');
  const hiddenNotice = document.createElement('p');
  hiddenNotice.className = 'preview-notice';
  const video = document.createElement('video');
  video.className = 'camera-preview';
  video.hidden = true;
  video.setAttribute('aria-label', '本地摄像头预览');
  video.style.transform = mirror ? 'scaleX(-1)' : 'none';
  const actions = document.createElement('div');
  actions.className = 'camera-actions';
  actions.append(enable, close, toggle, skeleton);
  preview.append(video, overlay.element);
  const checks = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '摄像头验收状态';
  const resources = document.createElement('p');
  resources.className = 'camera-resource-status';
  resources.setAttribute('aria-live', 'polite');
  const help = document.createElement('p');
  help.textContent =
    '此处只显示本页面的软件状态。关闭后，还需亲自确认浏览器摄像头占用指示熄灭。画面不会被录制或上传。';
  checks.append(summary, resources, help);
  const secondary = document.createElement('details');
  secondary.className = 'camera-secondary';
  const secondarySummary = document.createElement('summary');
  secondarySummary.textContent = '预览与识别状态';
  const compact = document.defaultView!.matchMedia('(max-width: 1023px)');
  const adapt = () => {
    secondary.open = !compact.matches;
  };
  adapt();
  compact.addEventListener('change', adapt);
  secondary.append(secondarySummary, preview, checks);
  section.append(actions, message, hiddenNotice, secondary);
  return {
    section,
    enable,
    close,
    toggle,
    message,
    video,
    skeleton,
    overlay,
    dispose() {
      compact.removeEventListener('change', adapt);
    },
    updateResources(state: CameraResources) {
      resources.textContent = cameraResourceText(state);
    },
    update(phase: string, previewVisible: boolean) {
      const state = cameraPresentation(phase, previewVisible);
      section.dataset.cameraState = phase;
      enable.disabled = state.enableDisabled;
      close.disabled = state.closeDisabled;
      close.textContent = state.closeLabel;
      toggle.disabled = !state.live;
      toggle.textContent = state.previewLabel;
      toggle.setAttribute('aria-pressed', String(!previewVisible));
      video.hidden = state.previewHidden;
      preview.hidden = state.previewHidden;
      skeleton.disabled = !state.live;
      if (state.previewHidden) overlay.clear();
      hiddenNotice.textContent = state.hiddenNotice;
    },
  };
}
