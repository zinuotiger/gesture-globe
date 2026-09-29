import {
  browserCameraEnvironment,
  detectCameraCapability,
  CoordinateAdapter,
  type CameraState,
} from '../camera/index.ts';
import { StreamController, VideoSource } from '../camera/index.ts';
import {
  monotonicNow,
  type VisionFrame,
  type AppError,
} from '../shared/index.ts';
import type { AppConfig } from '../config/index.ts';
import { createCameraCard } from '../ui/index.ts';

/** Only explicit button activation starts camera permission. */
export function mountCamera(
  root: HTMLElement,
  config: Readonly<AppConfig>,
  onState: (state: Readonly<CameraState>) => void = () => {},
  requestActivation: (start: () => void, trigger: HTMLElement) => void = (
    start,
  ) => start(),
  onCapabilityError: (code: AppError['code']) => void = () => {},
  onPreferences: (patch: {
    showPreview?: boolean;
    showSkeleton?: boolean;
  }) => void = () => {},
) {
  const document = root.ownerDocument;
  const card = createCameraCard(document, config.camera.previewMirror);
  const { section, enable, close, toggle, message, video } = card;
  let previewVisible = true;
  let skeletonVisible = true;
  let overlayAt = -Infinity;
  let previewSize: { width: number; height: number } | undefined;
  root.querySelector('.welcome')?.append(section);
  const camera = new StreamController(config);
  const source = new VideoSource(video, config);
  let boundStream: MediaStream | undefined;
  // Keep counts only, never retain stopped streams or camera frames for QA.
  let lastClosed: { total: number; ended: number } | null = null;
  const privacy = root.querySelector('.privacy');
  const unsubscribe = camera.subscribe((state) => {
    onState(state);
    const stream = camera.getStream();
    if (stream && stream !== boundStream) {
      boundStream = stream;
      section.dataset.videoState = 'loading';
      void source.bind(stream).then((result) => {
        if (camera.getStream() !== stream) return;
        section.dataset.videoState = result.ok ? 'ready' : 'failed';
        if (!result.ok) camera.fail(result.error);
      });
    } else if (!stream) {
      if (boundStream) {
        const tracks = boundStream.getTracks();
        lastClosed = {
          total: tracks.length,
          ended: tracks.filter((track) => track.readyState === 'ended').length,
        };
      }
      boundStream = undefined;
      source.unbind();
      section.dataset.videoState = 'off';
    }
    card.update(state.phase, previewVisible);
    card.updateResources({
      liveTracks:
        stream?.getTracks().filter((track) => track.readyState === 'live')
          .length ?? 0,
      lastClosed,
      videoAttached: video.srcObject !== null,
    });
    if (privacy)
      privacy.textContent = ['ACTIVE', 'MUTED'].includes(state.phase)
        ? '摄像头已开启 · 仅本地处理'
        : '摄像头已关闭';
    message.textContent =
      state.error?.guidance ??
      {
        OFF: '仅在你主动启用后申请摄像头，不请求麦克风。',
        REQUESTING: '请在浏览器中选择是否允许摄像头。',
        WAITING: '等待浏览器授权，你可以取消。',
        ACTIVE: '摄像头已开启，正在准备本地手势识别。',
        MUTED: '摄像头画面暂时不可用，等待设备恢复。',
        ERROR: '摄像头无法使用，可继续鼠标控制。',
      }[state.phase];
  });
  const activate = () => {
    const capability = detectCameraCapability(browserCameraEnvironment());
    if (capability.available) {
      if (typeof document.defaultView?.Worker !== 'function') {
        message.textContent =
          '当前浏览器不支持本地手势处理，可继续使用鼠标和键盘。';
        onCapabilityError('E-CAP-002');
        return;
      }
      return camera.start();
    }
    message.textContent = capability.message;
    onCapabilityError(
      capability.reason === 'INSECURE' ? 'E-CAP-001' : 'E-CAP-002',
    );
  };
  const request = () => requestActivation(activate, enable);
  enable.addEventListener('click', request);
  const stop = () => camera.stop();
  close.addEventListener('click', stop);
  const togglePreview = () => {
    previewVisible = !previewVisible;
    card.update(camera.getState().phase, previewVisible);
    onPreferences({ showPreview: previewVisible });
  };
  toggle.addEventListener('click', togglePreview);
  const toggleSkeleton = () => {
    skeletonVisible = !skeletonVisible;
    card.skeleton.textContent = skeletonVisible ? '隐藏骨架' : '显示骨架';
    card.skeleton.setAttribute('aria-pressed', String(!skeletonVisible));
    card.overlay.setVisible(skeletonVisible);
    onPreferences({ showSkeleton: skeletonVisible });
  };
  card.skeleton.addEventListener('click', toggleSkeleton);
  document.defaultView?.addEventListener('pagehide', stop);
  return {
    setVisibility(preview: boolean, skeleton: boolean) {
      previewVisible = preview;
      skeletonVisible = skeleton;
      card.update(camera.getState().phase, previewVisible);
      card.skeleton.textContent = skeleton ? '隐藏骨架' : '显示骨架';
      card.skeleton.setAttribute('aria-pressed', String(!skeleton));
      card.overlay.setVisible(skeleton);
    },
    camera,
    source,
    retry() {
      camera.stop();
      return activate();
    },
    clearOverlay: () => card.overlay.clear(),
    expireOverlay() {
      if (monotonicNow() - overlayAt > config.vision.staleFrameMs)
        card.overlay.clear();
    },
    showOverlay(frame: VisionFrame) {
      overlayAt = frame.captureTimeMs;
      if (!previewVisible || !skeletonVisible || !source.getFrameSource()) {
        card.overlay.clear();
        return;
      }
      const rect = video.getBoundingClientRect();
      const adapter = new CoordinateAdapter(
        frame.source,
        { width: rect.width, height: rect.height },
        config,
      );
      const hands = frame.hands.map((hand) =>
        hand.landmarks.map((point) => adapter.modelToDisplay(point)),
      );
      card.overlay.update(
        hands.filter((points) => points.every((p) => p !== undefined)) as {
          x: number;
          y: number;
        }[][],
        { x: rect.width, y: rect.height },
      );
    },
    mapModelPointer(point: { x: number; y: number }, canvas: DOMRect) {
      if (!source.getFrameSource()) return undefined;
      const rect = video.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0)
        previewSize = { width: rect.width, height: rect.height };
      // Hidden preview keeps its last geometry; computed CSS covers hidden-before-first-frame.
      const style = document.defaultView?.getComputedStyle(video);
      const size = previewSize ?? {
        width: Number.parseFloat(style?.width ?? ''),
        height: Number.parseFloat(style?.height ?? ''),
      };
      const adapter = new CoordinateAdapter(
        { width: video.videoWidth, height: video.videoHeight },
        size,
        config,
      );
      const display = adapter.modelToDisplay(point);
      return display
        ? adapter.displayToCanvas(display, {
            x: canvas.left,
            y: canvas.top,
            width: canvas.width,
            height: canvas.height,
          })?.client
        : undefined;
    },
    setGestureStatus(text: string) {
      if (camera.getState().phase === 'ACTIVE') message.textContent = text;
    },
    dispose() {
      enable.removeEventListener('click', request);
      close.removeEventListener('click', stop);
      toggle.removeEventListener('click', togglePreview);
      card.skeleton.removeEventListener('click', toggleSkeleton);
      card.overlay.clear();
      document.defaultView?.removeEventListener('pagehide', stop);
      card.dispose();
      camera.dispose();
      source.dispose();
      unsubscribe();
      section.remove();
    },
  };
}
