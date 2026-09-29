import type { VisionWorkerClient } from '../vision/index.ts';

/** DOM ownership stays in App. The vision module only sees explicit lifecycle calls. */
export function bindVisionActivity(
  client: VisionWorkerClient,
  visibility: Pick<
    Document,
    'hidden' | 'addEventListener' | 'removeEventListener'
  >,
) {
  let enabled = true;
  const update = () => {
    if (!enabled || visibility.hidden)
      client.pause(visibility.hidden ? 'PAGE_HIDDEN' : 'GESTURE_DISABLED');
    else client.resume();
  };
  const unsubscribe = client.subscribe((state) => {
    if (state.phase === 'READY' && (!enabled || visibility.hidden)) update();
  });
  visibility.addEventListener('visibilitychange', update);
  update();
  return {
    setEnabled(value: boolean) {
      enabled = value;
      update();
    },
    dispose() {
      unsubscribe();
      visibility.removeEventListener('visibilitychange', update);
    },
  };
}
