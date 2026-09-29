import type { AppConfig } from '../config/index.ts';
import type { AppStore } from './AppStore.ts';
import {
  EventRingBuffer,
  HealthEvaluator,
  type MetricCollector,
  type LatencyTracer,
} from '../diagnostics/index.ts';
import { createDiagnosticsPanel } from '../ui/index.ts';
import type { InteractionEvent } from '../interaction/index.ts';
import { monotonicNow } from '../shared/index.ts';

export function mountDiagnostics(
  root: HTMLElement,
  config: Readonly<AppConfig>,
  store: AppStore,
  metrics: MetricCollector,
  latency: LatencyTracer,
  stopCamera: () => void,
) {
  const events = new EventRingBuffer(config.diagnostics.eventCapacity);
  const health = new HealthEvaluator(config.diagnostics.health);
  const panel = createDiagnosticsPanel(
    root.ownerDocument,
    () => events.clear(),
    stopCamera,
  );
  (root.querySelector('.settings-body') ?? root).append(panel.trigger);
  root.append(panel.element);
  let lastAt = -Infinity;
  let lastDrops: ReturnType<MetricCollector['snapshot']>['drops'] | undefined;
  let anonymousSession = 0;
  let session: string | undefined;
  let previousAlerts = '';
  let updates = 0;
  let disposed = false;
  const unsubscribeSession = store.subscribe(
    (s) => s.sessionId,
    (id) => {
      session = id ? `session-${++anonymousSession}` : undefined;
    },
  );
  const unsubscribeGesture = store.subscribe(
    (s) => `${s.gesture.kind}:${s.gesture.status}`,
    () => {
      const s = store.getState();
      events.record({
        type: 'GESTURE',
        module: 'M05',
        atMs: monotonicNow(),
        gesture: s.gesture.kind,
        state: s.gesture.status,
        ...(session ? { sessionId: session } : {}),
      });
    },
  );
  let previousErrors: ReturnType<AppStore['getState']>['errors'] = [];
  const unsubscribeErrors = store.subscribe(
    (s) => s.errors,
    (errors) => {
      for (const error of errors) {
        if (
          previousErrors.some(
            (e) => e.id === error.id && e.lastAtMs === error.lastAtMs,
          )
        )
          continue;
        events.record({
          type: 'ERROR',
          module: error.module,
          atMs: error.lastAtMs ?? error.atMs,
          code: error.code,
          recoverable: error.recoverable,
          ...(session ? { sessionId: session } : {}),
        });
      }
      previousErrors = errors;
    },
  );
  const value = (n: number | null, suffix = '') =>
    n === null ? '未知' : `${n.toFixed(1)}${suffix}`;
  return {
    onInteraction(event: Readonly<InteractionEvent>) {
      if (disposed) return;
      if (event.type === 'SOURCE_CHANGED')
        events.record({
          type: 'SOURCE',
          module: 'M06',
          atMs: event.atMs,
          source: event.source ?? 'NONE',
        });
      if (event.type === 'COMMAND_RESULT' && event.commandType)
        events.record({
          type: 'COMMAND',
          module: 'M06',
          atMs: event.atMs,
          source: event.source ?? 'NONE',
          command: event.commandType,
          state: event.accepted ? 'ACCEPTED' : 'REJECTED',
        });
    },
    tick(atMs: number, restarts: number, targetHz = config.vision.targetHz) {
      if (
        disposed ||
        !Number.isFinite(atMs) ||
        atMs - lastAt < 1000 / config.diagnostics.uiHz
      )
        return;
      lastAt = atMs;
      if (root.ownerDocument.hidden) {
        lastDrops = undefined;
        return;
      }
      const m = metrics.snapshot(atMs),
        l = latency.snapshot(atMs);
      const drops = m.drops;
      let ratio: number | null = null;
      if (
        lastDrops &&
        drops.submitted >= lastDrops.submitted &&
        drops.busy >= lastDrops.busy &&
        drops.stale >= lastDrops.stale
      ) {
        const submitted = drops.submitted - lastDrops.submitted,
          busy = drops.busy - lastDrops.busy,
          stale = drops.stale - lastDrops.stale;
        if (submitted + busy > 0)
          ratio = Math.min(1, (busy + stale) / (submitted + busy));
      }
      lastDrops = drops;
      const alerts = health.evaluate(
        {
          renderFps: m.renderFps,
          inferenceP95: m.inference.p95,
          latencyP95: l.captureToRender.p95,
          dropRatio: ratio,
          restarts,
        },
        atMs,
      );
      if (alerts.join() !== previousAlerts) {
        previousAlerts = alerts.join();
        events.record({
          type: 'HEALTH',
          module: 'M10',
          atMs,
          state: alerts.length ? 'WARNING' : 'HEALTHY',
          code: 'E-PERF-001',
          recoverable: true,
        });
      }
      if (!panel.isOpen()) return;
      updates++;
      panel.update({
        summary: [
          `配置 ${config.configVersion} · 统计窗口 ${config.diagnostics.metricWindowMs}ms`,
          `渲染 ${value(m.renderFps, ' FPS')} · 帧中位 ${value(m.render.median, 'ms')} · P95 ${value(m.render.p95, 'ms')}`,
          `推理 ${value(m.inferenceFps, ' Hz')} · 最近 ${value(m.inference.latest, 'ms')} · 均值 ${value(m.inference.mean, 'ms')} · P95 ${value(m.inference.p95, 'ms')}`,
          `响应估计 P95 ${value(l.captureToRender.p95, 'ms')} · capture→result ${value(l.captureToResult.latest)} →intent ${value(l.resultToIntent.latest)} →command ${value(l.intentToCommand.latest)} →render ${value(l.commandToRender.latest)} ms`,
          `丢帧 busy=${drops.busy} stale=${drops.stale} rate=${drops.rate} unavailable=${drops.unavailable} · Worker 重启 ${restarts} · 目标推理 ${targetHz}Hz`,
          `健康 ${alerts.length ? alerts.join(' / ') : '无活动告警（无数据不代表验收通过）'}`,
          `事件 ${events.snapshot().length}/${events.capacity} · 手势 ${store.getState().gesture.kind}/${store.getState().gesture.status}`,
        ].join('\n'),
        events: events
          .snapshot()
          .map(
            (e) =>
              `${Math.round(e.atMs)} ${e.module} ${e.type} ${e.source ?? ''} ${e.command ?? e.gesture ?? e.code ?? ''} ${e.state ?? ''}`,
          ),
      });
    },
    snapshot: () => ({
      events: events.snapshot(),
      alerts: health.snapshot(),
      updates,
      rejectedEvents: events.getRejected(),
    }),
    dispose() {
      disposed = true;
      unsubscribeSession();
      unsubscribeGesture();
      unsubscribeErrors();
      panel.dispose();
      events.clear();
      health.reset();
      previousErrors = [];
    },
  };
}
