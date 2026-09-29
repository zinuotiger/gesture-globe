import {
  directionToGeo,
  geoToDirection,
  normalizeLongitude,
} from '../shared/index.ts';
import type { AppConfig } from '../config/index.ts';

/** Shares the same offset/orientation as CameraRig focus and the Earth UVs. */
export class GeoConverter {
  private readonly longitudeOffset: number;
  private readonly radius: number;
  constructor(config: Readonly<AppConfig>) {
    this.longitudeOffset = config.geo.longitudeOffsetDeg;
    this.radius = config.globe.earthRadius;
  }
  worldToGeo(point: Readonly<{ x: number; y: number; z: number }>) {
    return directionToGeo(point, this.longitudeOffset);
  }
  geoToWorld(latitude: number, longitude: number) {
    if (
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude)
    )
      return undefined;
    const point = geoToDirection(
      latitude,
      normalizeLongitude(longitude),
      this.longitudeOffset,
    );
    return Object.freeze({
      x: point.x * this.radius,
      y: point.y * this.radius,
      z: point.z * this.radius,
    });
  }
}
