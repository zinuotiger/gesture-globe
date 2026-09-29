/** Project-authored pictograms. No model objects, media, network or new assets. */
const lessons = [
  {
    id: 'palm',
    title: '张掌 · 旋转',
    pose: '五指自然张开，掌心朝向摄像头，手腕和指尖完整入框。',
    action: '先稳住张掌，再缓慢左右或上下移动整只手；手停，旋转也应停。',
    condition: '等状态从候选变成旋转就绪，再移动。不要先捏合或握拳。',
    result: '地球随掌心位移旋转；方向以镜像预览和当前反向设置为准。',
  },
  {
    id: 'pinch',
    title: '捏合 · 缩放',
    pose: '拇指与食指指尖靠拢并保持捏合，其余手指自然放松。',
    action: '保持两指捏合，上下移动整只手。默认上移放大、下移缩小。',
    condition: '先稳住捏合，再移动；不是靠两指张开距离或把手推近镜头。',
    result: '地球大小改变；松开捏合停止缩放。',
  },
  {
    id: 'fist',
    title: '握拳 · 暂停',
    pose: '四指收拢握拳，拇指自然搭在外侧，拳面朝向摄像头。',
    action: '短暂稳住拳头，不需要移动；松开后重新摆出想用的手势。',
    condition: '状态显示暂停后，手势控制停止；鼠标和键盘仍可操作。',
    result: '停止当前手势动作。它不是关闭摄像头，也不是持续锁住鼠标。',
  },
  {
    id: 'point',
    title: '食指 · 选地点',
    pose: '伸直食指，其余手指收拢，指尖向上、整只手入框。',
    action: '移动食指，把屏幕指针放到地球表面，再在同一区域稳住约{dwell}秒。',
    condition:
      '看屏幕指针和进度圈，不是把手指朝镜头戳。移到背景或明显漂移会中断。',
    result: '进度完成后出现地点信息；快速扫过不会选中。',
  },
  {
    id: 'victory',
    title: 'V 字 · 复位',
    pose: '食指与中指伸直分开成 V，其余手指收拢，掌面朝向摄像头。',
    action: '保持到复位完成；持续举着只触发一次。',
    condition:
      '再次复位前先放下或换姿势，再举 V；需等待约{cooldown}秒冷却。刚操作鼠标时先稍等。',
    result: '回到初始视角和距离；不重启摄像头。',
  },
] as const;

function illustration(document: Document, id: string) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 210 180');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `${lessons.find((x) => x.id === id)!.title}手形与动作示意`,
  );
  const hand = document.createElementNS(ns, 'g');
  hand.setAttribute('class', `guide-hand guide-${id}`);
  const path = (d: string) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    hand.append(p);
  };
  path(
    'M78 133 L78 91 Q78 78 91 78 L125 78 Q140 80 139 99 L137 131 Q135 149 122 151 L92 151 Q78 147 78 133 Z',
  );
  if (id === 'palm') {
    path(
      'M83 88 V44 Q83 35 88 35 Q94 35 94 44 V80 M101 80 V30 Q101 22 107 22 Q113 22 113 30 V80 M120 82 V40 Q120 32 126 32 Q132 32 132 40 V89 M137 91 V62 Q137 54 143 54 Q149 54 149 62 V110 M79 116 L57 89 Q50 81 44 87 Q40 92 46 101 L81 144',
    );
  } else if (id === 'pinch') {
    path(
      'M85 92 V64 Q85 43 65 45 Q49 45 49 63 Q49 70 55 70 Q61 70 62 61 M79 120 L49 87 Q41 77 49 70 Q55 66 61 75 L88 95 M102 87 Q109 66 115 85 M116 89 Q124 72 130 91 M129 97 Q139 83 142 104',
    );
  } else {
    path(
      'M82 99 Q87 82 97 99 M98 99 Q107 82 116 99 M117 100 Q126 86 136 104 M80 118 L110 106 Q123 105 122 115 L95 130',
    );
    if (id === 'point') path('M83 90 V37 Q83 26 90 26 Q97 26 97 37 V92');
    if (id === 'victory')
      path(
        'M82 91 L66 42 Q63 30 70 28 Q77 26 81 38 L98 84 M106 86 L120 37 Q123 26 131 29 Q137 32 133 44 L120 96',
      );
  }
  svg.append(hand);
  const arrows = document.createElementNS(ns, 'path');
  arrows.setAttribute('class', 'guide-arrow');
  arrows.setAttribute(
    'd',
    id === 'palm'
      ? 'M20 150 H60 M20 150 L28 143 M20 150 L28 157 M60 150 L52 143 M60 150 L52 157'
      : id === 'pinch'
        ? 'M175 45 V133 M175 45 L168 54 M175 45 L182 54 M175 133 L168 124 M175 133 L182 124'
        : 'M168 95 A22 22 0 1 1 167 94',
  );
  svg.append(arrows);
  return svg;
}

export function createGestureGuide(
  document: Document,
  timing: Readonly<{ dwellMs: number; victoryCooldownMs: number }>,
) {
  const element = document.createElement('section');
  element.className = 'gesture-guide';
  element.hidden = true;
  element.id = 'gesture-guide';
  element.setAttribute('aria-label', '手势图解');
  const header = document.createElement('div');
  header.className = 'guide-header';
  const heading = document.createElement('h2');
  heading.textContent = '看图做手势';
  const select = document.createElement('select');
  select.setAttribute('aria-label', '选择手势图解');
  for (const lesson of lessons) {
    const option = document.createElement('option');
    option.value = lesson.id;
    option.textContent = lesson.title;
    select.append(option);
  }
  const animate = document.createElement('button');
  animate.type = 'button';
  animate.textContent = '切换静态图';
  animate.setAttribute('aria-pressed', 'false');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '收起图解';
  header.append(heading, select, animate, close);
  const body = document.createElement('div');
  body.className = 'guide-body';
  const note = document.createElement('p');
  note.className = 'guide-note';
  note.textContent =
    '左右手都可，只用一只主手。图为手形示意；看镜像预览确认移动方向。先看候选，再看控制状态；鼠标操作优先。减少动画模式下显示静态图。';
  element.append(header, body, note);
  let trigger: HTMLElement | undefined;
  function render() {
    const lesson = lessons.find((x) => x.id === select.value) ?? lessons[0];
    const copy = document.createElement('div');
    for (const [label, text] of [
      ['摆手', lesson.pose],
      ['动作', lesson.action],
      ['触发', lesson.condition],
      ['效果', lesson.result],
    ]) {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = label + '：';
      p.append(
        strong,
        document.createTextNode(
          text!
            .replace('{dwell}', String(timing.dwellMs / 1000))
            .replace('{cooldown}', String(timing.victoryCooldownMs / 1000)),
        ),
      );
      copy.append(p);
    }
    body.replaceChildren(illustration(document, lesson.id), copy);
  }
  function hide() {
    element.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    trigger?.focus();
  }
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hide();
    }
  };
  const toggle = () => {
    const paused = element.dataset.static !== 'true';
    element.dataset.static = String(paused);
    animate.setAttribute('aria-pressed', String(paused));
    animate.textContent = paused ? '播放动作示意' : '切换静态图';
  };
  select.addEventListener('change', render);
  close.addEventListener('click', hide);
  animate.addEventListener('click', toggle);
  element.addEventListener('keydown', key);
  render();
  return {
    element,
    open(from: HTMLElement) {
      trigger = from;
      from.setAttribute('aria-expanded', 'true');
      element.hidden = false;
      select.focus();
    },
    dispose() {
      select.removeEventListener('change', render);
      close.removeEventListener('click', hide);
      animate.removeEventListener('click', toggle);
      element.removeEventListener('keydown', key);
      element.remove();
    },
  };
}
