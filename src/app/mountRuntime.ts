import type { AppConfig } from '../config/index.ts';
import { mountScene } from './mountScene.ts';
import { mountCamera } from './mountCamera.ts';
import { mountGesture } from './mountGesture.ts';
import { AppStore, type CameraStatus } from './AppStore.ts';
import { StatusPresenter } from './StatusPresenter.ts';
import { mountErrors } from './mountErrors.ts';
import { raiseAppError, resolveAppErrors } from './errorState.ts';
import { mountOnboarding } from './mountOnboarding.ts';
import { mountSettings } from './mountSettings.ts';
import { mountDiagnostics } from './mountDiagnostics.ts';
import { PerformanceGovernor } from './PerformanceGovernor.ts';
import type { InteractionEvent } from '../interaction/index.ts';
import type { Preferences } from './Preferences.ts';
import { MetricCollector, LatencyTracer } from '../diagnostics/index.ts';
import { GestureFeedbackPresenter } from './GestureFeedbackPresenter.ts';
import { createTopStatusBar, createGestureFeedback } from '../ui/index.ts';
import {
  monotonicNow,
  type GestureIntentKind,
  type AppError,
} from '../shared/index.ts';

export function mountRuntime(root: HTMLElement, config: Readonly<AppConfig>) {
  const store = new AppStore(config);
  const performanceGovernor = new PerformanceGovernor(config);
  const metrics = new MetricCollector({
    capacity: config.diagnostics.metricCapacity,
    windowMs: config.diagnostics.metricWindowMs,
  });
  const latency = new LatencyTracer({
    capacity: config.diagnostics.metricCapacity,
    windowMs: config.diagnostics.metricWindowMs,
  });
  const bar = createTopStatusBar(root.ownerDocument);
  root.querySelector('header')?.after(bar.element);
  if (!bar.element.isConnected) root.prepend(bar.element);
  const presenter = new StatusPresenter(config.diagnostics.uiHz, (state) =>
    bar.update(state),
  );
  const unsubscribe = store.subscribe(
    (state) => state,
    (state) => presenter.offer(state),
  );
  const unphase = store.subscribe(
    (state) => state.appPhase,
    (phase) => {
      root.dataset.appPhase = phase;
    },
  );
  let changePreferences: (patch: Partial<Preferences>) => void = () => {};
  let observeInteraction: (
    event: Readonly<InteractionEvent>,
  ) => void = () => {};
  const scene = mountScene(
    root,
    config,
    store,
    (quality) => changePreferences({ quality }),
    (atMs) => {
      if (!root.ownerDocument.hidden) {
        metrics.recordRender(atMs);
        latency.rendered(atMs);
      }
    },
    (event) => {
      observeInteraction(event);
      if (event.type === 'INPUT_ACCEPTED' && event.id && event.traceId)
        latency.associate(event.id, event.traceId);
      if (
        event.type === 'COMMAND_RESULT' &&
        event.accepted &&
        event.traceId &&
        event.commandType
      )
        latency.command(event.traceId, event.commandType, monotonicNow());
      if (event.type === 'SOURCE_CANCELLED' && event.traceId)
        latency.cancel(event.traceId);
    },
  );
  const onboarding = mountOnboarding(root, store, config);
  const camera = mountCamera(
    root,
    config,
    (state) => {
      const statuses: Record<typeof state.phase, CameraStatus> = {
        OFF: 'OFF',
        REQUESTING: 'REQUESTING',
        WAITING: 'REQUESTING',
        ACTIVE: 'STREAMING',
        MUTED: 'INTERRUPTED',
        ERROR: 'ERROR',
      };
      store.dispatch({
        type: 'CAMERA_STATE_CHANGED',
        atMs: monotonicNow(),
        status: statuses[state.phase],
      });
      if (state.error && state.error.severity !== 'INFO')
        raiseAppError(
          store,
          state.error.code,
          'M03',
          state.error.severity,
          state.error.retryPolicy,
        );
      else if (state.phase === 'ACTIVE' || state.phase === 'OFF') {
        resolveAppErrors(store, 'E-CAM-');
        resolveAppErrors(store, 'E-CAP-');
      }
      if (state.phase === 'OFF') resolveAppErrors(store, 'E-VIS-');
    },
    onboarding.requestActivation,
    (code) => raiseAppError(store, code, 'M01'),
    (patch) => changePreferences(patch),
  );
  onboarding.attach();
  const feedback = createGestureFeedback(root.ownerDocument);
  root.querySelector('.camera-secondary')?.append(feedback.element);
  const gesturePresenter = new GestureFeedbackPresenter(
    config.ui.candidateHz,
    feedback.updateCandidate,
    feedback.updateEffective,
  );
  const ungesture = store.subscribe(
    (state) => state,
    () => gesturePresenter.offer(store.getState()),
  );
  scene.setPointerMapper(camera.mapModelPointer);
  const interaction = scene.getInteraction();
  const gesture = interaction
    ? mountGesture(
        root,
        config,
        camera,
        interaction,
        (state) => {
          if (state.phase !== 'READY') {
            metrics.pauseInference();
            latency.pause();
          }
          const atMs = monotonicNow();
          if (state.phase === 'STOPPED') {
            // Camera owns permission/off/error state. Stopping inference during a
            // permission request must not turn that request into a fictitious OFF.
            return;
          }
          if (!state.sessionId || !state.operationId) return;
          const token = {
            sessionId: state.sessionId,
            operationId: state.operationId,
          };
          if (store.getState().operationId !== state.operationId)
            store.dispatch({
              type: 'GESTURE_ENABLE_REQUESTED',
              atMs,
              ...token,
            });
          store.dispatch({
            type: 'VISION_STATE_CHANGED',
            atMs,
            ...token,
            status: state.phase === 'DEGRADED' ? 'ERROR' : state.phase,
          });
          if (state.phase === 'DEGRADED')
            raiseAppError(
              store,
              (state.errorCode ?? 'E-VIS-003') as AppError['code'],
              'M04',
              'ERROR',
              'USER',
              state.sessionId,
            );
          if (state.phase === 'READY') resolveAppErrors(store, 'E-VIS-');
          if (state.phase === 'READY')
            store.dispatch({
              type: 'VISION_FRAME_APPLIED',
              atMs: monotonicNow(),
              ...token,
              hand: state.hand,
              gesture: {
                status: state.gesturePhase,
                kind: state.gesture as GestureIntentKind,
                confidence: state.confidence,
                candidate: state.candidate,
              },
            });
        },
        (inferenceMs) => metrics.recordInference(monotonicNow(), inferenceMs),
        (inputId, timing) => {
          latency.recordIntent(inputId, timing);
        },
      )
    : undefined;
  const stopCamera = () => {
    camera.camera.stop();
    interaction?.cancelSource('gesture', 'MOUSE_FALLBACK');
  };
  const settings = mountSettings(root, config, store, {
    quality: scene.setQuality,
    visibility: camera.setVisibility,
    gesture: (value) => gesture?.setPreferences(value),
    reducedMotion: scene.setReducedMotion,
    autoRotate: scene.setAutoRotate,
    stopCamera,
    resetOnboarding: onboarding.reset,
  });
  changePreferences = settings.change;
  const diagnostics = mountDiagnostics(
    root,
    config,
    store,
    metrics,
    latency,
    stopCamera,
  );
  observeInteraction = diagnostics.onInteraction;
  const errors = mountErrors(
    root,
    store,
    config,
    {
      RETRY_CAMERA: () => camera.retry(),
      RETRY_VISION: () => gesture?.retry(),
      RETRY_TEXTURE: () => scene.retryTexture(),
      RETRY_CITY: () => scene.retryCity(),
      CONTINUE_WITH_MOUSE: stopCamera,
      RELOAD_APP: () => root.ownerDocument.defaultView?.location.reload(),
    },
    () => {
      stopCamera();
      scene.stopForFatal();
    },
  );
  // Context loss disables camera/recognition immediately, including before FATAL.
  const uncontext = store.subscribe(
    (state) => state.errors.some((e) => e.code === 'E-GLB-002'),
    (lost) => {
      if (lost) stopCamera();
    },
  );
  const window = root.ownerDocument.defaultView!;
  const pauseMetrics = () => {
    latency.pause();
    metrics.pauseRender();
    metrics.pauseInference();
  };
  root.ownerDocument.addEventListener('visibilitychange', pauseMetrics);
  let frame: number | null = null;
  let disposed = false;
  let adaptiveAt = -Infinity;
  const tick = () => {
    if (disposed) return;
    presenter.flush(monotonicNow());
    const observed = gesture?.getMetrics();
    if (observed)
      metrics.updateDrops({
        submitted: observed.frames.submitted,
        busy: observed.frames.droppedBusy,
        stale: observed.dropped.stale,
        rate: observed.frames.droppedRate,
        unavailable: observed.frames.droppedUnavailable,
      });
    const atMs = monotonicNow();
    diagnostics?.tick(
      atMs,
      observed?.restarts ?? 0,
      observed?.frames.targetHz ?? config.vision.targetHz,
    );
    if (atMs - adaptiveAt >= 1000 / config.diagnostics.uiHz) {
      adaptiveAt = atMs;
      const measured = metrics.snapshot(atMs);
      const adaptive = performanceGovernor.observe({
        atMs,
        visible: !root.ownerDocument.hidden,
        inferenceActive: gesture?.getState().phase === 'READY',
        renderFps: measured.renderFps,
        inferenceP95: measured.inference.p95,
        latencyP95: latency.snapshot(atMs).captureToRender.p95,
        alerts: diagnostics.snapshot().alerts,
      });
      const qualityState = scene.getQualityState();
      if (
        qualityState?.requested === 'AUTO' &&
        qualityState.effective !== adaptive.autoQuality
      )
        scene.setAutomaticQuality(adaptive.autoQuality);
      if (gesture && observed && observed.frames.targetHz !== adaptive.targetHz)
        gesture.setTargetHz(adaptive.targetHz);
    }
    frame = window.requestAnimationFrame(tick);
  };
  tick();
  return {
    store,
    agentPort: scene.getAgentPort(),
    getMetrics: () => metrics.snapshot(monotonicNow()),
    getLatency: () => latency.snapshot(monotonicNow()),
    getDiagnostics: () => diagnostics?.snapshot(),
    getPerformance: () => performanceGovernor.snapshot(),
    getVisionMetrics: () => gesture?.getMetrics() ?? null,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      root.ownerDocument.removeEventListener('visibilitychange', pauseMetrics);
      errors.dispose();
      diagnostics?.dispose();
      settings.dispose();
      uncontext();
      gesture?.dispose();
      ungesture();
      gesturePresenter.dispose();
      feedback.dispose();
      camera.dispose();
      scene.dispose();
      onboarding.dispose();
      store.dispatch({ type: 'APP_DISPOSED', atMs: monotonicNow() });
      unsubscribe();
      unphase();
      presenter.dispose();
      bar.dispose();
      store.dispose();
      metrics.dispose();
      latency.dispose();
    },
  };
}
