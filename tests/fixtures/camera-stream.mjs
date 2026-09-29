/** Synthetic lifecycle fixture only; never evidence of actual camera hardware. */
export function fakeStream() {
  const listeners = new Map();
  const track = {
    kind: 'video',
    readyState: 'live',
    muted: false,
    stops: 0,
    stop() {
      this.stops++;
      this.readyState = 'ended';
    },
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener(name, fn) {
      listeners.get(name)?.delete(fn);
    },
    fire(name) {
      for (const fn of [...(listeners.get(name) ?? [])]) fn();
    },
  };
  return {
    track,
    listeners,
    stream: {
      getTracks: () => [track],
      getVideoTracks: () => [track],
      getAudioTracks: () => [],
    },
  };
}
