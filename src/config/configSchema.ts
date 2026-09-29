import { defaults, type AppConfig, freezeConfig } from './defaults.ts';
import { numericRules } from './numericRules.ts';

export interface ConfigIssue {
  path: string;
  message: string;
}
export class ConfigValidationError extends Error {
  readonly issues: readonly ConfigIssue[];
  constructor(issues: readonly ConfigIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}
export type ConfigEnvironment = 'development' | 'test' | 'production';
const enums: Record<string, readonly string[]> = {
  'app.defaultQuality': ['LOW', 'MEDIUM', 'HIGH', 'AUTO'],
  'quality.autoInitial': ['LOW', 'MEDIUM', 'HIGH'],
  'geo.pointerMode': ['safeRect', 'fullViewport'],
};

export function parseConfig(
  raw: unknown = {},
  environment: ConfigEnvironment = 'production',
): Readonly<AppConfig> {
  const issues: ConfigIssue[] = [];
  const issue = (path: string, message: string) =>
    issues.push({ path, message });
  const merge = (
    base: Record<string, unknown>,
    input: unknown,
    prefix: string,
  ): Record<string, unknown> => {
    if (
      !input ||
      typeof input !== 'object' ||
      (Object.getPrototypeOf(input) !== Object.prototype &&
        Object.getPrototypeOf(input) !== null)
    ) {
      issue(prefix || '$', 'expected plain configuration object');
      input = {};
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of Reflect.ownKeys(input as object)) {
      if (typeof key !== 'string' || !Object.hasOwn(base, key))
        issue(`${prefix}${String(key)}`, 'unknown configuration field');
    }
    return Object.fromEntries(
      Object.entries(base).map(([key, fallback]) => {
        const path = `${prefix}${key}`;
        const descriptor = descriptors[key];
        if (descriptor && !('value' in descriptor)) {
          issue(path, 'accessors are forbidden');
          return [key, fallback];
        }
        const value: unknown = descriptor ? descriptor.value : fallback;
        if (fallback && typeof fallback === 'object')
          return [
            key,
            merge(fallback as Record<string, unknown>, value, `${path}.`),
          ];
        if (typeof value !== typeof fallback) {
          issue(path, `expected ${typeof fallback}`);
          return [key, fallback];
        }
        if (typeof value === 'number') {
          const rule = numericRules[path];
          if (
            !rule ||
            !Number.isFinite(value) ||
            value < rule.min ||
            value > rule.max ||
            (rule.integer && !Number.isInteger(value))
          )
            issue(path, 'out of validated range or nonfinite');
        }
        if (
          typeof value === 'string' &&
          enums[path] &&
          !enums[path].includes(value)
        )
          issue(path, 'unknown enum value');
        return [key, value];
      }),
    );
  };
  const result = merge(defaults, raw, '') as unknown as AppConfig;
  if (result.schemaVersion !== 1 || result.app.schemaVersion !== 1)
    issue('schemaVersion', 'unsupported version');
  if (result.configVersion !== defaults.configVersion)
    issue('configVersion', 'unsupported configuration version');
  if (!result.app.hiddenPause) issue('app.hiddenPause', 'required in P0');
  const tracking = result.handTracking;
  if (
    Math.abs(
      tracking.handednessWeight +
        tracking.gestureWeight +
        tracking.completenessWeight +
        tracking.sizeWeight -
        1,
    ) > 1e-9
  )
    issue('handTracking', 'quality weights must sum to one');
  if (result.handQuality.minBboxArea >= result.handQuality.maxBboxArea)
    issue('handQuality.minBboxArea', 'must be below maximum hand area');
  if (result.vision.heartbeatTimeoutMs < 2 * result.vision.heartbeatIntervalMs)
    issue(
      'vision.heartbeatTimeoutMs',
      'must allow at least two probe intervals',
    );
  if (result.vision.numHands !== 1 || result.vision.worldLandmarks)
    issue('vision', 'P0 uses one hand and disables world landmarks');
  if (result.features.voice || result.features.diagnosticsExport)
    issue('features', 'voice and diagnostics export are outside this build');
  if (
    environment === 'production' &&
    (result.features.mockVision || result.features.debug)
  )
    issue('features', 'debug/mock injection forbidden in production');
  if (!(result.pinch.enterRatio < result.pinch.exitRatio))
    issue('pinch.enterRatio', 'must be below exitRatio');
  if (!(result.openPalm.holdScore < result.openPalm.enterScore))
    issue('openPalm.holdScore', 'must be below enterScore');
  if (!(
    result.globe.minDistance > result.globe.earthRadius &&
    result.globe.minDistance < result.globe.maxDistance
  ))
    issue(
      'globe.minDistance',
      'must be outside earthRadius and below maxDistance',
    );
  if (!(result.globe.minPolar < result.globe.maxPolar))
    issue('globe.minPolar', 'must be below maxPolar');
  if (
    !(result.globe.farClip > result.earth.starRadius + result.globe.maxDistance)
  )
    issue(
      'globe.farClip',
      'must include the star field from every camera distance',
    );
  if (!(
    result.globe.minTransitionMs <= result.globe.resetDurationMs &&
    result.globe.resetDurationMs <= result.globe.maxTransitionMs
  ))
    issue('globe.resetDurationMs', 'must be within transition duration bounds');
  if (!(
    result.globe.initialPolar >= result.globe.minPolar &&
    result.globe.initialPolar <= result.globe.maxPolar
  ))
    issue('globe.initialPolar', 'must be within polar bounds');
  if (!(
    result.globe.initialDistance >= result.globe.minDistance &&
    result.globe.initialDistance <= result.globe.maxDistance
  ))
    issue('globe.initialDistance', 'must be within camera distance bounds');
  if (
    !(
      result.globe.nearClip <
      result.globe.minDistance - result.globe.earthRadius
    )
  )
    issue('globe.nearClip', 'must not clip the nearest earth surface');
  if (!(
    result.vision.minHz <= result.vision.targetHz &&
    result.vision.targetHz <= result.camera.frameRateIdeal
  ))
    issue('vision.targetHz', 'must be between minHz and camera.frameRateIdeal');
  if (!(result.point.dwellMs > result.point.driftGraceMs))
    issue('point.dwellMs', 'must exceed driftGraceMs');
  const health = result.diagnostics.health;
  if (
    result.diagnostics.adaptive.recoveryHoldMs <=
    result.diagnostics.adaptive.stepCooldownMs
  )
    issue(
      'diagnostics.adaptive',
      'recovery must be slower than downgrade cooldown',
    );
  if (
    health.lowFps >= health.recoveredFps ||
    health.highInferenceMs <= health.recoveredInferenceMs ||
    health.highLatencyMs <= health.recoveredLatencyMs ||
    health.highDropRatio <= health.recoveredDropRatio ||
    health.recoverMs <= health.triggerMs
  )
    issue(
      'diagnostics.health',
      'health thresholds require recovery hysteresis',
    );
  if (issues.length) throw new ConfigValidationError(issues);
  return freezeConfig(result);
}

export function loadConfig(
  raw: unknown = {},
  environment: ConfigEnvironment = 'production',
) {
  try {
    return {
      config: parseConfig(raw, environment),
      issues: [] as readonly ConfigIssue[],
    };
  } catch (error) {
    if (!(error instanceof ConfigValidationError)) throw error;
    return { config: defaults, issues: error.issues };
  }
}
