import { defaults, type AppConfig } from '../config/index.ts';
import { createInputAdapter, type AgentPort } from '../interaction/index.ts';
import {
  monotonicNow,
  directionToGeo,
  type ViewState,
  type AgentPanelSnapshot,
  type AgentControlPort,
} from '../shared/index.ts';
import {
  parseToolCall,
  type ToolName,
  type ToolRegistry,
  type ToolResult,
} from './ToolRegistry.ts';
import type { GeocodingAdapter } from './GeocodingAdapter.ts';
import type { ExternalDataAdapters } from './ExternalDataAdapters.ts';

type ActionName = ToolName | 'undoView';
interface ActiveAction {
  id: number;
  name: ActionName;
  controller: AbortController;
  startedAt: number;
  viewBefore?: Readonly<ViewState>;
  undoTarget?: Readonly<ViewState>;
  phase: 'REQUESTING' | 'TRANSITION';
}
export class AgentActionCoordinator implements AgentControlPort {
  private active: ActiveAction | undefined;
  private previousView: Readonly<ViewState> | undefined;
  private sequence = 0;
  private disposed = false;
  private status: AgentPanelSnapshot['status'] = 'IDLE';
  private phase = '待命';
  private currentName: ActionName | undefined;
  private readonly input;
  private readonly unsubscribe;
  private readonly events: Readonly<{
    id: number;
    tool: ActionName;
    status: AgentPanelSnapshot['status'];
    atMs: number;
  }>[] = [];
  constructor(
    private readonly registry: ToolRegistry,
    private readonly port: AgentPort,
    private readonly config: Readonly<AppConfig> = defaults,
    private readonly geocoding?: GeocodingAdapter,
    private readonly external?: ExternalDataAdapters,
    private readonly now: () => number = monotonicNow,
  ) {
    this.input = createInputAdapter('agent', port, now, 'coordinator');
    this.unsubscribe = port.subscribe((event) => {
      if (event.type === 'INPUT_ACCEPTED' && event.source !== 'agent') {
        this.previousView = undefined;
        this.stop('用户已接管', false);
      } else if (
        event.type === 'SOURCE_CANCELLED' &&
        event.source === 'agent' &&
        this.active
      )
        this.stop('控制已中断', false);
    });
  }
  private record(
    action: ActiveAction,
    status: AgentPanelSnapshot['status'],
  ): void {
    this.events.push(
      Object.freeze({
        id: action.id,
        tool: action.name,
        status,
        atMs: this.now(),
      }),
    );
    if (this.events.length > this.config.diagnostics.eventCapacity)
      this.events.shift();
  }
  getEvents() {
    return Object.freeze([...this.events]);
  }
  private stop(message: string, release: boolean): void {
    const action = this.active;
    const confirmation =
      this.geocoding?.getState().status === 'AWAITING_CONFIRMATION';
    this.active = undefined;
    action?.controller.abort();
    if (action || confirmation) {
      this.geocoding?.cancel();
      this.external?.cancel();
      this.status = 'CANCELLED';
      this.phase = message;
      if (action) this.record(action, 'CANCELLED');
    }
    if (release) this.port.cancel();
  }
  cancel(): void {
    this.stop('已取消', true);
  }
  private finish(action: ActiveAction, success: boolean): void {
    if (this.active?.id !== action.id) return;
    this.active = undefined;
    if (success && action.viewBefore) this.previousView = action.viewBefore;
    this.status = success ? 'SUCCEEDED' : 'FAILED';
    this.phase = success ? '已完成' : '操作失败，请检查结果';
    this.record(action, this.status);
    if (success && action.undoTarget?.autoRotate)
      this.input.send('SET_AUTOROTATE', 'TRIGGER', { enabled: true });
    this.port.cancel();
  }
  async run(value: unknown): Promise<ToolResult> {
    if (this.disposed || !this.config.features.agent)
      return { status: 'REJECTED', code: 'DISABLED' };
    let call;
    try {
      call = parseToolCall(value, this.config);
    } catch {
      if (!this.active) {
        this.status = 'FAILED';
        this.phase = '请求参数无效';
      }
      return { status: 'REJECTED', code: 'INVALID_TOOL' };
    }
    this.stop('已被新操作替代', true);
    const pureView = call.name === 'focusLocation' || call.name === 'resetView';
    this.currentName = call.name;
    const action: ActiveAction = {
      id: ++this.sequence,
      name: call.name,
      controller: new AbortController(),
      startedAt: this.now(),
      phase: 'REQUESTING',
      ...(pureView ? { viewBefore: this.port.readView() } : {}),
    };
    if (pureView) this.previousView = undefined;
    this.active = action;
    this.status = 'RUNNING';
    this.phase = '正在处理';
    this.record(action, 'RUNNING');
    const result = await this.registry.execute(call, action.controller.signal);
    if (this.active?.id !== action.id)
      return { status: 'CANCELLED', code: 'CANCELLED' };
    if (result.status === 'CANCELLED') this.stop('已取消', true);
    else if (result.status !== 'SUCCEEDED') this.finish(action, false);
    else if (pureView && this.port.readView().transition !== 'IDLE') {
      action.phase = 'TRANSITION';
      this.phase = '正在调整视图';
    } else {
      this.finish(action, true);
      if (this.geocoding?.getState().status === 'AWAITING_CONFIRMATION') {
        this.status = 'AWAITING_CONFIRMATION';
        this.phase = '请选择明确地点';
      }
    }
    return result;
  }
  tick(): void {
    const action = this.active;
    if (!action || action.phase !== 'TRANSITION') return;
    if (this.port.readView().transition === 'IDLE') {
      this.finish(action, true);
      return;
    }
    const deadline =
      action.startedAt +
      this.config.globe.maxTransitionMs +
      this.config.globe.maxCommandDeltaSeconds * 1000;
    if (this.now() > deadline || !this.port.renewTransition())
      this.stop('视图操作已中断', true);
  }
  undo(): boolean {
    if (this.disposed || this.active || !this.previousView) return false;
    const target = this.previousView;
    this.previousView = undefined;
    this.currentName = 'undoView';
    const point = {
      x: Math.sin(target.polar) * Math.sin(target.azimuth),
      y: Math.cos(target.polar),
      z: Math.sin(target.polar) * Math.cos(target.azimuth),
    };
    const geo = directionToGeo(point, this.config.geo.longitudeOffsetDeg);
    if (!geo) return false;
    const action: ActiveAction = {
      id: ++this.sequence,
      name: 'undoView',
      controller: new AbortController(),
      startedAt: this.now(),
      phase: 'TRANSITION',
      undoTarget: target,
    };
    this.active = action;
    this.status = 'RUNNING';
    this.phase = '正在撤销视图';
    this.record(action, 'RUNNING');
    const accepted = this.input.send('FOCUS', 'TRIGGER', {
      lat: geo.latitude,
      lon: geo.longitude,
      distance: target.distance,
    }).accepted;
    if (!accepted) this.finish(action, false);
    else this.tick();
    return accepted;
  }
  async confirm(requestId: number, id: string): Promise<ToolResult> {
    const point = this.geocoding?.confirm(requestId, id);
    return point
      ? this.run({ name: 'selectGeo', args: point })
      : { status: 'REJECTED', code: 'INVALID_TOOL' };
  }
  snapshot(): AgentPanelSnapshot {
    const geo = this.geocoding?.getState(),
      external = this.external?.getState();
    const details: string[] = [];
    const latest =
      this.currentName === 'resolveLocation'
        ? geo
        : this.currentName === 'showWeather' || this.currentName === 'drawRoute'
          ? external
          : undefined;
    if (latest?.source) details.push(`来源：${latest.source}`);
    if (latest?.fetchedAt) details.push(`获取时间：${latest.fetchedAt}`);
    if (latest?.error) {
      const messages = {
        UNCONFIGURED: '服务尚未配置，本地地球仍可用',
        CANCELLED: '请求已取消',
        TIMEOUT: '服务响应超时，请稍后重试',
        RATE_LIMITED: '服务请求过多，请稍后重试',
        HTTP_ERROR: '服务暂时不可用',
        NETWORK_ERROR: '无法连接服务，请检查网络',
        INVALID_RESPONSE: '服务返回的数据无效，已拒绝显示',
        DISPATCH_REJECTED: '当前由用户控制，未更新路线',
      };
      details.push(messages[latest.error]);
    }
    if (latest === external && external?.data) {
      details.push(`数据时间：${external.data.observedAt}`);
      details.push(
        external.data.kind === 'weather'
          ? `${external.data.temperatureC} °C · ${external.data.condition}`
          : `路线 ${external.data.distanceKm} km · ${external.data.durationMinutes} 分钟`,
      );
    }
    return Object.freeze({
      status: this.status,
      phase: this.phase,
      canUndo: !!this.previousView && !this.active,
      canCancel: !!this.active || geo?.status === 'AWAITING_CONFIRMATION',
      requestId: geo?.requestId ?? 0,
      candidates: Object.freeze(
        geo?.status === 'AWAITING_CONFIRMATION'
          ? geo.candidates.map((p) =>
              Object.freeze({
                id: p.id,
                label: `${p.label} (${p.lat}, ${p.lon})`,
              }),
            )
          : [],
      ),
      details: Object.freeze(details),
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.stop('已关闭', true);
    this.disposed = true;
    this.unsubscribe();
    this.previousView = undefined;
    this.events.length = 0;
  }
}
