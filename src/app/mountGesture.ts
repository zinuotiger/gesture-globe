import type { AppConfig } from '../config/index.ts';
import type { CommandBus } from '../interaction/index.ts';
import type { mountCamera } from './mountCamera.ts';
import { createCameraFrameSource } from './createCameraFrameSource.ts';
import { GestureRuntime, type GestureRuntimeState } from './GestureRuntime.ts';
import type { Preferences } from './Preferences.ts';
import type { IntentTiming } from '../diagnostics/index.ts';

export function mountGesture(
  root: HTMLElement,
  config: Readonly<AppConfig>,
  camera: ReturnType<typeof mountCamera>,
  bus: CommandBus,
  onState: (state: Readonly<GestureRuntimeState>) => void = () => {},
  onInference: (inferenceMs: number) => void = () => {},
  observeIntent: (
    inputId: string,
    value: Readonly<IntentTiming>,
  ) => void = () => {},
) {
  const document = root.ownerDocument;
  const window = document.defaultView!;
  const feedback = document.createElement('p');
  feedback.className = 'gesture-feedback';
  root.querySelector('.camera-secondary')?.append(feedback);
  const display = (state: Readonly<GestureRuntimeState>) => {
    onState(state);
    feedback.dataset.phase = state.phase;
    feedback.dataset.acceptedFrames = String(state.acceptedFrames);
    feedback.textContent = {
      STOPPED: '手势识别未运行。',
      INITIALIZING: '正在本机加载手势模型…',
      READY:
        state.gesture === 'NONE'
          ? '手势识别已就绪 · 等待手势'
          : '手势识别已就绪',
      PAUSED: '手势识别已暂停。',
      DEGRADED: `手势识别不可用（${state.errorCode}），可关闭摄像头后重试，鼠标仍可使用。`,
    }[state.phase];
    if (state.phase === 'READY')
      camera.setGestureStatus('摄像头已开启，视频仅在本机用于手势识别。');
    if (state.phase === 'DEGRADED')
      camera.setGestureStatus('摄像头仍开启；模型不可用，可关闭摄像头后重试。');
  };
  const runtime = new GestureRuntime(
    config,
    bus,
    createCameraFrameSource(camera.source),
    display,
    undefined,
    undefined,
    (frame) => {
      if (frame) {
        camera.showOverlay(frame);
        onInference(frame.inferenceMs);
      } else camera.clearOverlay();
    },
    observeIntent,
  );
  display(runtime.getState());
  let frame: number | null = null;
  let disposed = false;
  const tick = () => {
    frame = null;
    if (
      disposed ||
      document.hidden ||
      camera.camera.getState().phase !== 'ACTIVE'
    )
      return;
    camera.expireOverlay();
    runtime.tick();
    frame = window.requestAnimationFrame(tick);
  };
  const stopTick = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  };
  const update = () => {
    const phase = camera.camera.getState().phase;
    if (phase !== 'ACTIVE' && phase !== 'MUTED') {
      stopTick();
      runtime.stop();
      return;
    }
    const paused = document.hidden || phase === 'MUTED';
    runtime.setPaused(paused);
    void runtime.start();
    if (paused) stopTick();
    else if (frame === null) frame = window.requestAnimationFrame(tick);
  };
  const unsubscribe = camera.camera.subscribe(update);
  document.addEventListener('visibilitychange', update);
  return {
    setPreferences: (preferences: Readonly<Preferences>) =>
      runtime.setPreferences(preferences),
    getState: () => runtime.getState(),
    async retry() {
      runtime.stop();
      if (camera.camera.getState().phase === 'ACTIVE' && !document.hidden)
        await runtime.start();
    },
    getMetrics: () => runtime.getMetrics(),
    setTargetHz: (hz: number) => runtime.setTargetHz(hz),
    dispose() {
      if (disposed) return;
      disposed = true;
      stopTick();
      unsubscribe();
      document.removeEventListener('visibilitychange', update);
      runtime.dispose();
      feedback.remove();
    },
  };
}
