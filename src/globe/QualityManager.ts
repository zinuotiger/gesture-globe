import type { AppConfig, QualityLevel } from '../config/index.ts';

export type EffectiveQuality = Exclude<QualityLevel, 'AUTO'>;
export interface QualityState {
  requested: QualityLevel;
  effective: EffectiveQuality;
  pixelRatioCap: number;
  atmosphere: boolean;
  clouds: false;
  postProcessing: false;
}
/** Explicit preference and separately bounded AUTO effective tier. */
export class QualityManager {
  private requested: QualityLevel;
  private automatic: EffectiveQuality;
  constructor(private readonly config: Readonly<AppConfig>) {
    this.requested = config.app.defaultQuality;
    this.automatic = config.quality.autoInitial;
  }
  set(value: unknown): boolean {
    if (!['LOW', 'MEDIUM', 'HIGH', 'AUTO'].includes(value as string))
      return false;
    this.requested = value as QualityLevel;
    return true;
  }
  getState(): QualityState {
    const effective =
      this.requested === 'AUTO' ? this.automatic : this.requested;
    const cap = {
      LOW: this.config.quality.lowPixelRatio,
      MEDIUM: this.config.quality.mediumPixelRatio,
      HIGH: this.config.globe.maxPixelRatio,
    }[effective];
    return Object.freeze({
      requested: this.requested,
      effective,
      pixelRatioCap: Math.min(cap, this.config.globe.maxPixelRatio),
      atmosphere: effective !== 'LOW',
      clouds: false,
      postProcessing: false,
    });
  }
  setAutomatic(value: unknown): boolean {
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(value as string)) return false;
    this.automatic = value as EffectiveQuality;
    return true;
  }
}
