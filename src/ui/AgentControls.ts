import type { AgentControlPort, AgentPanelSnapshot } from '../app/index.ts';

export function createAgentControls(
  document: Document,
  port: AgentControlPort,
) {
  const element = document.createElement('details');
  element.className = 'agent-panel';
  element.open = true;
  const summary = document.createElement('summary');
  summary.textContent = '工具助手（实验）';
  element.append(summary);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.className = 'agent-status';
  const results = document.createElement('div');
  results.className = 'agent-results';
  const choices = document.createElement('div');
  choices.className = 'agent-choices';
  let formError = '',
    candidateKey = '';
  const field = (
    labelText: string,
    type: string,
    min?: string,
    max?: string,
  ) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    input.step = 'any';
    if (min) input.min = min;
    if (max) input.max = max;
    input.addEventListener('input', () => {
      formError = '';
    });
    label.append(input);
    element.append(label);
    return input;
  };
  const query = field('地点名称', 'text');
  const button = (text: string, action: () => unknown) => {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = text;
    control.addEventListener('click', () => {
      formError = '';
      try {
        Promise.resolve(action()).catch(() => {
          formError = '操作未完成，请检查输入或服务状态';
        });
      } catch {
        formError = '请输入有效的名称和坐标';
      }
    });
    element.append(control);
    return control;
  };
  button('查找地点', () =>
    port.run({ name: 'resolveLocation', args: { query: query.value } }),
  );
  const latitude = field('起点纬度', 'number', '-90', '90'),
    longitude = field('起点经度', 'number', '-180', '180');
  const coordinates = (lat: HTMLInputElement, lon: HTMLInputElement) => {
    if (
      !lat.value.trim() ||
      !lon.value.trim() ||
      !lat.checkValidity() ||
      !lon.checkValidity()
    )
      throw new Error('Invalid coordinates');
    return { lat: Number(lat.value), lon: Number(lon.value) };
  };
  button('聚焦坐标', () =>
    port.run({ name: 'focusLocation', args: coordinates(latitude, longitude) }),
  );
  button('选择坐标', () =>
    port.run({ name: 'selectGeo', args: coordinates(latitude, longitude) }),
  );
  button('查询天气', () =>
    port.run({ name: 'showWeather', args: coordinates(latitude, longitude) }),
  );
  const toLat = field('终点纬度', 'number', '-90', '90'),
    toLon = field('终点经度', 'number', '-180', '180');
  button('查询路线', () =>
    port.run({
      name: 'drawRoute',
      args: {
        from: coordinates(latitude, longitude),
        to: coordinates(toLat, toLon),
      },
    }),
  );
  button('复位视图', () => port.run({ name: 'resetView', args: {} }));
  const cancel = button('取消操作', () => port.cancel()),
    undo = button('撤销视图', () => port.undo());
  element.append(status, choices, results);
  return {
    element,
    update(snapshot: AgentPanelSnapshot) {
      status.textContent = formError || snapshot.phase;
      status.dataset.status = snapshot.status;
      cancel.disabled = !snapshot.canCancel;
      undo.disabled = !snapshot.canUndo;
      results.replaceChildren(
        ...snapshot.details.map((text) => {
          const p = document.createElement('p');
          p.textContent = text;
          return p;
        }),
      );
      const key = JSON.stringify([snapshot.requestId, snapshot.candidates]);
      if (key !== candidateKey) {
        candidateKey = key;
        choices.replaceChildren(
          ...snapshot.candidates.map((candidate) => {
            const choice = document.createElement('button');
            choice.type = 'button';
            choice.textContent = `选择 ${candidate.label}`;
            choice.addEventListener('click', () => {
              void port.confirm(snapshot.requestId, candidate.id);
            });
            return choice;
          }),
        );
      }
    },
    dispose() {
      element.remove();
    },
  };
}
