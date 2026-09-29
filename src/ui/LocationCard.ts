import type { GeoSelection } from '../shared/index.ts';

export interface LocationPresentation {
  readonly selection: Readonly<GeoSelection> | null;
  readonly cityStatus: 'EMPTY' | 'LOADING' | 'MATCHED' | 'UNMATCHED' | 'ERROR';
}
/** Receives application state and emits actions; never reads renderer/model internals. */
export function createLocationCard(
  document: Document,
  actions: { clear(): void; focus(): void; retry(): void },
) {
  const element = document.createElement('section');
  element.className = 'location-card';
  element.setAttribute('aria-label', '选中地点');
  element.hidden = true;
  const title = document.createElement('h2');
  title.textContent = '选中地点';
  const coordinates = document.createElement('p');
  coordinates.className = 'location-coordinates';
  const city = document.createElement('p');
  city.setAttribute('aria-live', 'polite');
  const row = document.createElement('div');
  row.className = 'location-actions';
  const buttons = (['focus', 'clear', 'retry'] as const).map((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = {
      focus: '聚焦地点',
      clear: '清除地点',
      retry: '重载城市数据',
    }[action];
    button.addEventListener('click', actions[action]);
    row.append(button);
    return { button, action };
  });
  element.append(title, coordinates, city, row);
  return {
    element,
    update(state: LocationPresentation) {
      const selection = state.selection;
      element.hidden = !selection;
      element.dataset.selectionId = selection?.selectionId ?? '';
      element.dataset.cityStatus = state.cityStatus;
      coordinates.textContent = selection
        ? `纬度 ${selection.latitude.toFixed(4)}° · 经度 ${selection.longitude.toFixed(4)}°`
        : '';
      const match = selection?.nearestCity;
      city.textContent = match
        ? `${match.name} · ${match.countryOrRegion} · 距离 ${match.distanceKm.toFixed(1)} km`
        : state.cityStatus === 'LOADING'
          ? '正在匹配附近城市…'
          : state.cityStatus === 'ERROR'
            ? '城市数据不可用，已保留坐标。'
            : '未匹配附近城市';
      buttons[2]!.button.hidden = state.cityStatus !== 'ERROR';
    },
    dispose() {
      for (const { button, action } of buttons)
        button.removeEventListener('click', actions[action]);
      element.remove();
    },
  };
}
