import {
  Raycaster,
  Vector2,
  Matrix3,
  type Camera,
  Mesh,
  type Object3D,
} from 'three';
import type { ScreenPoint } from './ScreenMapper.ts';

function visible(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent)
    if (!current.visible) return false;
  return true;
}

/** Resolve the named public EarthLayer mesh; never use the scene as a raycast target. */
export function resolveEarthRaycaster(
  camera: Camera,
  scene: Object3D,
): EarthRaycaster | undefined {
  const earth = scene.getObjectByName('earth');
  return earth instanceof Mesh
    ? new EarthRaycaster(camera, [earth])
    : undefined;
}

/** The caller supplies only the public earth pick meshes, never the whole scene. */
export class EarthRaycaster {
  private readonly ray = new Raycaster();
  private readonly earthPickLayer: readonly Mesh[];
  constructor(
    private readonly camera: Camera,
    earthPickLayer: readonly Mesh[],
  ) {
    this.earthPickLayer = Object.freeze([...earthPickLayer]);
  }
  hit(ndc: ScreenPoint) {
    if (
      ![ndc.x, ndc.y].every(Number.isFinite) ||
      Math.abs(ndc.x) > 1 ||
      Math.abs(ndc.y) > 1
    )
      return undefined;
    this.camera.updateWorldMatrix(true, false);
    this.ray.setFromCamera(new Vector2(ndc.x, ndc.y), this.camera);
    const pickable = this.earthPickLayer.filter((mesh) => visible(mesh));
    for (const mesh of pickable) mesh.updateWorldMatrix(true, false);
    // Non-recursive: labels/markers added as children cannot become earth hits.
    const hit = this.ray
      .intersectObjects([...pickable], false)
      .find(
        (value) =>
          Number.isFinite(value.distance) &&
          value.distance > 0 &&
          [value.point.x, value.point.y, value.point.z].every(Number.isFinite),
      );
    if (!hit?.face) return undefined;
    const normal = hit.face.normal
      .clone()
      .applyMatrix3(new Matrix3().getNormalMatrix(hit.object.matrixWorld))
      .normalize();
    if (![normal.x, normal.y, normal.z].every(Number.isFinite))
      return undefined;
    return Object.freeze({
      point: Object.freeze({ x: hit.point.x, y: hit.point.y, z: hit.point.z }),
      normal: Object.freeze({ x: normal.x, y: normal.y, z: normal.z }),
      distance: hit.distance,
    });
  }
}
