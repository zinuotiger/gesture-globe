import {
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Matrix3,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';
import type { AppConfig } from '../config/index.ts';
import type { GeoSelection } from '../shared/index.ts';
import { GeoConverter } from './GeoConverter.ts';

/** Owns one reusable marker. The mesh never joins the earth pick layer. */
export class MarkerManager {
  private readonly mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
  private readonly converter: GeoConverter;
  private selection:
    Pick<GeoSelection, 'selectionId' | 'latitude' | 'longitude'> | undefined;
  private disposed = false;
  private readonly world = new Vector3();
  private readonly towardCamera = new Vector3();
  private readonly normal = new Vector3();
  private readonly normalMatrix = new Matrix3();
  constructor(
    private readonly parent: Object3D,
    config: Readonly<AppConfig>,
  ) {
    this.converter = new GeoConverter(config);
    // The configured normalized pointing radius sets marker scale as well.
    this.mesh = new Mesh(
      new SphereGeometry(
        config.globe.earthRadius * config.point.radiusNorm,
        16,
        8,
      ),
      new MeshBasicMaterial({
        color: 0xffc857,
        depthTest: true,
        depthWrite: true,
      }),
    );
    this.mesh.name = 'current-location-marker';
    this.mesh.visible = false;
    parent.add(this.mesh);
  }
  setSelection(selection: Readonly<GeoSelection>): void {
    if (this.disposed) return;
    if (
      selection.schemaVersion !== 1 ||
      !selection.selectionId.trim() ||
      !Number.isFinite(selection.selectedAtMs) ||
      selection.selectedAtMs < 0 ||
      !Number.isFinite(selection.longitude) ||
      selection.longitude < -180 ||
      selection.longitude >= 180
    )
      throw new TypeError('Invalid marker selection');
    const point = this.converter.geoToWorld(
      selection.latitude,
      selection.longitude,
    );
    if (!point) throw new TypeError('Invalid marker coordinate');
    if (
      this.selection?.selectionId === selection.selectionId &&
      (this.selection.latitude !== selection.latitude ||
        this.selection.longitude !== selection.longitude)
    )
      throw new Error('One selectionId cannot identify different coordinates');
    this.selection = Object.freeze({
      selectionId: selection.selectionId,
      latitude: selection.latitude,
      longitude: selection.longitude,
    });
    this.mesh.position.set(point.x, point.y, point.z);
    this.mesh.visible = false; // Only update(camera) may confirm visibility.
  }
  update(camera: Camera) {
    if (this.disposed || !this.selection) {
      this.mesh.visible = false;
      return this.getState();
    }
    this.parent.updateWorldMatrix(true, false);
    this.mesh.updateWorldMatrix(true, false);
    const location = this.mesh.getWorldPosition(this.world);
    const towardCamera = camera
      .getWorldPosition(this.towardCamera)
      .sub(location);
    const normal = this.normal
      .copy(this.mesh.position)
      .normalize()
      .applyNormalMatrix(
        this.normalMatrix.getNormalMatrix(this.parent.matrixWorld),
      );
    const facing = normal.dot(towardCamera);
    this.mesh.visible = Number.isFinite(facing) && facing > 0;
    return this.getState();
  }
  getState() {
    return Object.freeze({
      selectionId: this.selection?.selectionId ?? null,
      visible: this.mesh.visible,
      position: Object.freeze({
        x: this.mesh.position.x,
        y: this.mesh.position.y,
        z: this.mesh.position.z,
      }),
    });
  }
  clear(): void {
    this.selection = undefined;
    this.mesh.visible = false;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
