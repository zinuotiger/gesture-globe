import {
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Vector3,
  type Object3D,
} from 'three';
import type { AppConfig } from '../config/index.ts';
import { geoToDirection, type GeoCoordinate } from '../shared/index.ts';

/** One bounded overlay of provider-supplied coordinates, never a route planner. */
export class RouteOverlay {
  private readonly line = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({ color: 0x72deff, depthTest: true }),
  );
  private disposed = false;
  constructor(
    private readonly parent: Object3D,
    private readonly config: Readonly<AppConfig>,
  ) {
    this.line.name = 'external-route-overlay';
    this.line.visible = false;
    parent.add(this.line);
  }
  setPoints(points: readonly GeoCoordinate[]): boolean {
    if (
      this.disposed ||
      points.length < 2 ||
      points.length > this.config.agent.maxRoutePoints ||
      points.some(
        (p) =>
          !Number.isFinite(p.lat) ||
          !Number.isFinite(p.lon) ||
          Math.abs(p.lat) > 90 ||
          Math.abs(p.lon) > 180,
      )
    )
      return false;
    const directions = points.map((p) => {
      const v = geoToDirection(
        p.lat,
        p.lon,
        this.config.geo.longitudeOffsetDeg,
      );
      return new Vector3(v.x, v.y, v.z);
    });
    const vertices: Vector3[] = [];
    const radius =
      this.config.globe.earthRadius * (1 + this.config.agent.routeHeightRatio);
    for (let index = 1; index < directions.length; index++) {
      const from = directions[index - 1]!,
        to = directions[index]!;
      const angle = from.angleTo(to);
      if (Math.PI - angle < this.config.handQuality.geometryEpsilon)
        return false;
      const steps = Math.max(
        1,
        Math.ceil((angle * 180) / Math.PI / this.config.agent.routeStepDegrees),
      );
      if (vertices.length + steps + 1 > this.config.agent.maxRouteRenderPoints)
        return false;
      for (let step = index === 1 ? 0 : 1; step <= steps; step++) {
        const t = step / steps;
        const v =
          angle < this.config.handQuality.geometryEpsilon
            ? from.clone()
            : from
                .clone()
                .multiplyScalar(Math.sin((1 - t) * angle) / Math.sin(angle))
                .addScaledVector(to, Math.sin(t * angle) / Math.sin(angle));
        vertices.push(v.normalize().multiplyScalar(radius));
      }
    }
    const next = new BufferGeometry().setFromPoints(vertices);
    this.line.geometry.dispose();
    this.line.geometry = next;
    this.line.visible = true;
    return true;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.parent.remove(this.line);
    this.line.geometry.dispose();
    this.line.material.dispose();
  }
}
