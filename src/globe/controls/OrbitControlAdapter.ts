import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PerspectiveCamera } from 'three';
import type { AppConfig } from '../../config/index.ts';
import type { CameraRig } from '../CameraRig.ts';

export interface OrbitInputSink {
  start(): void;
  cancel(): void;
  /** Flush prior proposals; false means M06 still owns an unconsumed batch. */
  settle?(): boolean;
  move(
    delta: Readonly<{ yaw: number; pitch: number; delta: number; dt: number }>,
  ): void;
}
const angleDelta = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
// Floating-point roundoff only, not a gesture or interaction threshold.
const numericalZero = (n: number) =>
  Math.abs(n) <= Number.EPSILON * 32 ? 0 : n;

/** Orbit owns a proposal camera, never the rendered camera or authoritative rig. */
export class OrbitControlAdapter {
  private readonly controls: OrbitControls;
  private readonly camera: PerspectiveCamera;
  private disposed = false;
  private active = false;
  private previousTime: number | undefined;
  constructor(
    camera: PerspectiveCamera,
    element: HTMLElement,
    private readonly rig: CameraRig,
    private readonly config: Readonly<AppConfig>,
    private readonly sink: OrbitInputSink,
  ) {
    this.camera = camera.clone();
    const controls = new OrbitControls(this.camera, element);
    this.controls = controls;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = config.globe.orbitDamping;
    controls.minDistance = config.globe.minDistance;
    controls.maxDistance = config.globe.maxDistance;
    controls.minPolarAngle = config.globe.minPolar;
    controls.maxPolarAngle = config.globe.maxPolar;
    controls.target.set(0, 0, 0);
    controls.addEventListener('start', this.start);
    this.clearMomentum();
  }
  private start = (): void => {
    if (this.disposed) return;
    this.sink.start();
    this.active = true;
  };
  enable(): void {
    if (!this.disposed) this.controls.enabled = true;
  }
  disable(): void {
    this.controls.enabled = false;
    this.sink.cancel();
    this.clearMomentum();
  }
  update(time: number): void {
    if (this.disposed || !this.controls.enabled) return;
    const dt =
      this.previousTime === undefined
        ? 1 / this.config.interaction.commandHz
        : Math.min(
            (time - this.previousTime) / 1000,
            this.config.globe.maxCommandDeltaSeconds,
          );
    if (!this.active) {
      this.clearMomentum();
      this.previousTime = time;
      return;
    }
    this.controls.update();
    // This is an error relative to the rig, not a new incremental input. Never
    // count an unconsumed residual twice. M06 owns the rate/clock and flushes it
    // before we read the rig again; Orbit damping still updates every frame.
    if (!(dt > 0) || this.sink.settle?.() === false) return;
    this.previousTime = time;
    const view = this.rig.getView();
    const yaw = numericalZero(
      angleDelta(this.controls.getAzimuthalAngle(), view.azimuth),
    );
    const pitch = numericalZero(this.controls.getPolarAngle() - view.polar);
    const delta = numericalZero(this.controls.getDistance() - view.distance);
    if (yaw || pitch || delta) this.sink.move({ yaw, pitch, delta, dt });
  }
  dispose(): void {
    if (this.disposed) return;
    this.sink.cancel();
    this.disposed = true;
    this.controls.enabled = false;
    this.controls.removeEventListener('start', this.start);
    this.controls.dispose();
  }
  clearMomentum(): void {
    if (this.disposed) return;
    this.active = false;
    this.previousTime = undefined;
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    const { x, y, z } = this.rig.getPosition();
    this.camera.position.set(x, y, z);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.controls.enableDamping = damping;
  }
}
