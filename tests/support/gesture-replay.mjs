import { createHash } from 'node:crypto';
import { GestureEngine } from '../../src/gesture/index.ts';
import { defaults, parseConfig } from '../../src/config/index.ts';
import { parseVisionFixture } from '../../src/vision/MockVisionClient.ts';
// Test-only in-memory runner: no production import, camera, file write, timer or raw-frame export.
export function runGestureReplay(input, config = defaults) {
  const validated = parseConfig(config, 'test');
  if (input?.configVersion !== validated.configVersion)
    throw new Error('Fixture configVersion mismatch');
  const fixture = parseVisionFixture(input);
  const engine = new GestureEngine(validated);
  const rows = fixture.frames.map((frame) => ({
    frameId: frame.frameId,
    intents: engine.update(frame),
    debug: engine.getDebugState(),
  }));
  return {
    fixtureId: fixture.fixtureId,
    source: 'synthetic',
    configVersion: validated.configVersion,
    configSha256: createHash('sha256')
      .update(JSON.stringify(validated))
      .digest('hex'),
    rows,
  };
}
