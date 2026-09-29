import assert from 'node:assert/strict';
import { test } from 'vitest';
import { cameraPresentation, cameraResourceText } from '../../src/ui/index.ts';

test('resource display reports counts without inventing a stop result before a stream exists', () => {
  assert.match(
    cameraResourceText({
      liveTracks: 0,
      lastClosed: null,
      videoAttached: false,
    }),
    /尚无关闭记录/,
  );
  assert.equal(
    cameraResourceText({
      liveTracks: 1,
      lastClosed: null,
      videoAttached: true,
    }),
    '活动轨道：1；最近释放轨道：尚无关闭记录；预览绑定：已连接',
  );
  assert.equal(
    cameraResourceText({
      liveTracks: 0,
      lastClosed: { total: 2, ended: 1 },
      videoAttached: false,
    }),
    '活动轨道：0；最近释放轨道：1/2；预览绑定：已解除',
  );
});
test('camera presentation distinguishes hidden live preview from off and permission waiting', () => {
  const hidden = cameraPresentation('ACTIVE', false);
  assert.equal(hidden.live, true);
  assert.equal(hidden.previewHidden, true);
  assert.equal(hidden.closeDisabled, false);
  assert.equal(hidden.previewLabel, '显示画面');
  assert.match(hidden.hiddenNotice, /仍开启/);
  assert.equal(cameraPresentation('ACTIVE', true).previewHidden, false);
  const off = cameraPresentation('OFF', true);
  assert.equal(off.live, false);
  assert.equal(off.closeDisabled, true);
  assert.equal(off.enableDisabled, false);
  assert.equal(cameraPresentation('WAITING', true).closeLabel, '取消授权等待');
  assert.equal(cameraPresentation('ERROR', true).enableDisabled, false);
});
