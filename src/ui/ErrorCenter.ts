import type { AppError } from '../shared/index.ts';
import type { ErrorRecord } from '../app/index.ts';
export type RecoveryAction =
  | 'RETRY_CAMERA'
  | 'RETRY_VISION'
  | 'RETRY_TEXTURE'
  | 'RETRY_CITY'
  | 'CONTINUE_WITH_MOUSE'
  | 'RELOAD_APP';
export interface ErrorCopy {
  title: string;
  impact: string;
  next: string;
  action?: RecoveryAction;
  mouse: boolean;
}
export function errorCopy(error: AppError): ErrorCopy {
  if (error.severity === 'FATAL')
    return {
      title: '无法启动三维场景',
      impact: '当前图形功能不可用，摄像头已关闭。',
      next: '请检查浏览器图形加速或兼容性设置，然后请重新加载页面。',
      action: 'RELOAD_APP',
      mouse: false,
    };
  if (error.code.startsWith('E-CAM-')) {
    const reasons: Record<string, [string, string]> = {
      'E-CAM-001': [
        '摄像头权限未获允许',
        '请通过地址栏权限图标或浏览器设置允许摄像头，再主动重试。',
      ],
      'E-CAM-002': ['未找到摄像头', '请连接摄像头，再主动重试。'],
      'E-CAM-003': [
        '摄像头暂时无法读取',
        '请关闭可能占用摄像头的其他程序，再主动重试。',
      ],
      'E-CAM-004': [
        '摄像头不支持当前视频要求',
        '已尝试降低要求；请检查设备设置，再主动重试。',
      ],
      'E-CAM-005': [
        '仍在等待摄像头授权',
        '请在浏览器选择允许，或选择继续用鼠标以取消本次等待。',
      ],
      'E-CAM-006': ['摄像头连接已中断', '请重新连接设备，再主动重试。'],
      'E-CAM-007': ['摄像头画面未能就绪', '请检查摄像头状态，再主动重试。'],
    };
    const [title, next] = reasons[error.code] ?? [
      '摄像头暂时不可用',
      '请检查设备后重试。',
    ];
    return {
      title,
      next,
      impact: '手势控制暂不可用，地球仍可用鼠标和键盘操作。',
      ...(error.code === 'E-CAM-005'
        ? {}
        : { action: 'RETRY_CAMERA' as const }),
      mouse: true,
    };
  }
  if (error.code.startsWith('E-CAP-'))
    return {
      title: '当前环境不支持本地手势控制',
      impact: '手势控制不可用，鼠标和键盘仍可使用。',
      next: '请使用支持摄像头的浏览器，并通过 HTTPS 或本机 localhost 打开页面。',
      mouse: true,
    };
  if (error.code.startsWith('E-VIS-'))
    return {
      title: '本地手势识别暂不可用',
      impact: '摄像头可能仍开启；当前不会执行手势，鼠标和键盘仍可使用。',
      next:
        error.code === 'E-VIS-006'
          ? '识别组件版本不一致，请重新加载页面。'
          : '请确认本地模型与识别组件已准备好，再重试识别；也可以关闭摄像头继续用鼠标。',
      action: error.code === 'E-VIS-006' ? 'RELOAD_APP' : 'RETRY_VISION',
      mouse: true,
    };
  if (error.code === 'E-GLB-001')
    return {
      title: '地球纹理加载失败',
      impact: '正在使用备用材质，地球控制仍可使用。',
      next: '请检查连接，然后重载纹理。',
      action: 'RETRY_TEXTURE',
      mouse: false,
    };
  if (error.code === 'E-GLB-002')
    return {
      title: '图形上下文暂时丢失',
      impact: '地球渲染已暂停，摄像头已关闭。',
      next: '正在等待浏览器恢复；如持续不可用，请重新加载页面。',
      action: 'RELOAD_APP',
      mouse: false,
    };
  if (error.code === 'E-GEO-001')
    return {
      title: '城市数据未能加载',
      impact: '已保留选中经纬度，暂时无法匹配附近城市。',
      next: '请检查连接，然后重载城市数据。',
      action: 'RETRY_CITY',
      mouse: false,
    };
  return {
    title: '部分功能暂时不可用',
    impact: '无效操作已拒绝，已有地点与视图会保留。',
    next: '请停止当前操作并使用仍可用的鼠标或键盘控制；持续发生时重新加载页面。',
    mouse: false,
  };
}
const actionLabels: Record<RecoveryAction, string> = {
  RETRY_CAMERA: '重试摄像头',
  RETRY_VISION: '重试手势识别',
  RETRY_TEXTURE: '重载地球纹理',
  RETRY_CITY: '重载城市数据',
  CONTINUE_WITH_MOUSE: '继续用鼠标',
  RELOAD_APP: '重新加载页面',
};
export function createErrorCenter(
  document: Document,
  version: string,
  act: (action: RecoveryAction, error: ErrorRecord) => Promise<void>,
) {
  const element = document.createElement('section');
  element.className = 'error-center';
  element.setAttribute('aria-label', '错误与恢复');
  element.hidden = true;
  const cards = new Map<
    string,
    { element: HTMLElement; update: (e: ErrorRecord) => void }
  >();
  function create(error: ErrorRecord) {
    let current = error,
      pending = false;
    const article = document.createElement('article');
    article.className = 'error-card';
    article.dataset.errorCode = error.code;
    const heading = document.createElement(
      error.severity === 'FATAL' ? 'h1' : 'h2',
    );
    const text = document.createElement('p'),
      detail = document.createElement('details'),
      summary = document.createElement('summary'),
      info = document.createElement('p'),
      actions = document.createElement('div');
    summary.textContent = '错误详情';
    detail.append(summary, info);
    actions.className = 'error-actions';
    const copy = errorCopy(error);
    heading.textContent = copy.title;
    text.textContent = `${copy.title}。${copy.impact} ${copy.next}`;
    if (error.severity === 'FATAL') text.setAttribute('role', 'status');
    else text.setAttribute('aria-live', 'polite');
    const buttons: HTMLButtonElement[] = [];
    for (const action of [
      ...(copy.action ? [copy.action] : []),
      ...(copy.mouse ? ['CONTINUE_WITH_MOUSE' as const] : []),
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = actionLabels[action];
      button.addEventListener('click', () => {
        if (pending) return;
        pending = true;
        buttons.forEach((b) => (b.disabled = true));
        void act(action, current)
          .catch(() => {
            text.textContent = `恢复尚未成功。${copy.impact} ${copy.next}`;
          })
          .finally(() => {
            pending = false;
            buttons.forEach((b) => (b.disabled = false));
          });
      });
      buttons.push(button);
      actions.append(button);
    }
    article.append(heading, text, actions, detail);
    function update(value: ErrorRecord) {
      current = value;
      info.textContent = `错误码：${value.code} · 次数：${value.occurrences ?? 1} · 时间：${Math.round(value.lastAtMs ?? value.atMs)}ms · 配置：${version}`;
    }
    update(error);
    return { element: article, update };
  }
  return {
    element,
    update(errors: readonly ErrorRecord[]) {
      const fatal = errors.find((e) => e.severity === 'FATAL');
      const visible = fatal
        ? [fatal]
        : errors.filter((e) => e.severity !== 'INFO');
      const keys = new Set(
        visible.map((e) => `${e.code}:${e.sessionId ?? ''}:${e.severity}`),
      );
      for (const [key, card] of cards)
        if (!keys.has(key)) {
          card.element.remove();
          cards.delete(key);
        }
      for (const error of visible) {
        const key = `${error.code}:${error.sessionId ?? ''}:${error.severity}`;
        let card = cards.get(key);
        if (!card) {
          card = create(error);
          cards.set(key, card);
          element.append(card.element);
        } else card.update(error);
      }
      element.hidden = visible.length === 0;
      element.dataset.fatal = String(!!fatal);
    },
    dispose() {
      cards.clear();
      element.remove();
    },
  };
}
