import { test, expect, vi } from 'vitest';
import { AppStore } from '../../src/app/index.ts';
import { GestureFeedbackPresenter } from '../../src/app/GestureFeedbackPresenter.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';
import { DwellSelector } from '../../src/geo/index.ts';
import { gestureFeedbackText } from '../../src/ui/index.ts';
test('candidate deadline is 100ms/max10Hz, active and PAUSE bypass throttle; dispose cancels trailing work', () => {
  vi.useFakeTimers();
  try {
    const base = new AppStore(defaults).getState(),
      candidates = [],
      active = [];
    const presenter = new GestureFeedbackPresenter(
      defaults.ui.candidateHz,
      (t) => candidates.push([Date.now(), t]),
      (t) => active.push(t),
      Date.now,
    );
    presenter.offer(base);
    for (let i = 1; i < 100; i++) {
      vi.advanceTimersByTime(1);
      presenter.offer({
        ...base,
        gesture: {
          status: 'CANDIDATE',
          kind: 'NONE',
          candidate: 'Open_Palm',
          confidence: 0.8,
        },
      });
    }
    expect(candidates).toHaveLength(1);
    expect(active.at(-1)).toContain('等待手势');
    vi.advanceTimersByTime(1);
    expect(candidates).toHaveLength(2);
    expect(candidates[1][0] - candidates[0][0]).toBe(100);
    expect(candidates[1][1]).toContain('尚未执行');
    presenter.offer({
      ...base,
      control: { ...base.control, source: 'gesture' },
      gesture: { ...base.gesture, status: 'ACTIVE', kind: 'ROTATE' },
    });
    expect(active.at(-1)).toContain('旋转就绪');
    presenter.offer({
      ...base,
      gesture: { ...base.gesture, status: 'PAUSED', kind: 'PAUSE' },
    });
    expect(active.at(-1)).toContain('握拳暂停');
    presenter.dispose();
    vi.advanceTimersByTime(1000);
    expect(candidates).toHaveLength(2);
    expect(() => parseConfig({ ui: { candidateHz: 11 } })).toThrow();
    expect(() => parseConfig({ ui: { candidateHz: 5 } })).toThrow();
  } finally {
    vi.useRealTimers();
  }
});
test('candidate single frame never becomes an effective command in feedback', () => {
  const base = new AppStore(defaults).getState();
  const text = gestureFeedbackText({
    ...base,
    gesture: { ...base.gesture, status: 'CANDIDATE', candidate: 'Victory' },
  });
  expect(text.candidate).toContain('胜利手势');
  expect(text.effective).toContain('等待手势');
});
test('display uses exact algorithm progress across drift, missing hits and stale expiry', () => {
  const dwell = new DwellSelector(defaults),
    p = { x: 0.5, y: 0.5 },
    hit = { x: 0, y: 0, z: 1 };
  dwell.update(p, hit, 0);
  dwell.update(p, hit, 100);
  expect(dwell.getState().progress).toBe(100 / defaults.point.dwellMs);
  dwell.update({ x: 0.6, y: 0.5 }, hit, 150);
  expect(dwell.getState().phase).toBe('DRIFTING');
  expect(dwell.expire(200).progress).toBe(100 / defaults.point.dwellMs);
  expect(dwell.expire(301).progress).toBe(0);
  expect(dwell.update(p, undefined, 350).state.center).toBeNull();
});
test('feedback distinguishes pose recognition, unmet entry conditions and actual manual arbitration', () => {
  const base = new AppStore(defaults).getState();
  expect(
    gestureFeedbackText({ ...base, handStatus: 'NO_HAND' }).effective,
  ).toContain('未检测到手');
  expect(
    gestureFeedbackText({ ...base, handStatus: 'UNREADY' }).effective,
  ).toContain('位置不适合控制');
  expect(
    gestureFeedbackText({ ...base, handStatus: 'READY' }).effective,
  ).toContain('尚未满足触发条件');
  const pose = {
    ...base,
    gesture: { ...base.gesture, kind: 'ROTATE', status: 'ACTIVE' },
  };
  expect(gestureFeedbackText(pose).effective).toContain('尚未取得控制');
  expect(
    gestureFeedbackText({
      ...pose,
      control: { ...base.control, source: 'mouse' },
    }).effective,
  ).toContain('手势暂不执行');
  expect(
    gestureFeedbackText({
      ...pose,
      control: { ...base.control, source: 'gesture' },
    }).effective,
  ).toContain('旋转就绪');
  expect(
    gestureFeedbackText({
      ...base,
      view: { ...base.view, transition: 'RESET' },
    }).effective,
  ).toContain('正在复位');
});
