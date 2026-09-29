import { defaults } from '../../src/config/index.ts';
import { gestureFrame, pinchFrame } from './gesture-frames.mjs';
export const replayNames = [
  'five-gestures',
  'priority',
  'two-hands',
  'loss',
  'gap',
  'reacquire-gap',
  'stationary-60s',
];
// FIRST_PARTY authored numeric geometry; never captured human landmarks.
export function gestureReplayFixture(name) {
  if (!replayNames.includes(name)) throw new Error(`Unknown fixture ${name}`);
  const frames = [];
  const add = (count, make = (id) => gestureFrame(id, id * 40)) => {
    for (let n = 0; n < count; n++) frames.push(make(frames.length));
  };
  if (name === 'five-gestures') {
    for (const gesture of [
      'Open_Palm',
      'Closed_Fist',
      'None',
      'Victory',
      'None',
      'Pointing_Up',
    ])
      add(8, (id) => gestureFrame(id, id * 40, { gesture }));
    add(20, (id) => pinchFrame(id, id * 40));
    add(1, (id) => ({ ...gestureFrame(id, id * 40), hands: [] }));
  } else if (name === 'priority') {
    add(60, (id) => {
      const frame = pinchFrame(id, id * 40);
      frame.hands[0].gestures = [
        'Open_Palm',
        'Pointing_Up',
        'Victory',
        'Closed_Fist',
      ].map((name) => ({ name, score: 0.95 }));
      return frame;
    });
  } else if (name === 'two-hands') {
    add(60, (id) => {
      const frame = gestureFrame(id, id * 40);
      const other = gestureFrame(id, id * 40, { x: 0.7, handedness: 'Left' })
        .hands[0];
      frame.hands[0].localId = `slot-${id % 2}`;
      other.localId = `slot-${(id + 1) % 2}`;
      frame.hands = id % 2 ? [other, frame.hands[0]] : [frame.hands[0], other];
      return frame;
    });
  } else if (name === 'loss') {
    add(5);
    add(5, (id) => ({ ...gestureFrame(id, id * 40), hands: [] }));
    add(5);
  } else if (name === 'gap' || name === 'reacquire-gap') {
    add(5);
    add(5, (id) => gestureFrame(id, id * 40 + (name === 'gap' ? 120 : 200)));
  } else add(1501);
  return {
    schemaVersion: 1,
    fixtureId: `gesture-${name}-v1`,
    source: 'synthetic',
    configVersion: defaults.configVersion,
    frames,
  };
}
