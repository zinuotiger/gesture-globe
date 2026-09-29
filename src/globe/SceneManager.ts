import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { AppConfig } from '../config/index.ts';
import { CameraRig } from './CameraRig.ts';
import { CommandExecutor } from './CommandExecutor.ts';
import { TransitionController } from './TransitionController.ts';
import { observeViewport } from './observeViewport.ts';
import { EarthLayer, type EarthTextureState } from './EarthLayer.ts';
import {
  OrbitControlAdapter,
  type OrbitInputSink,
} from './controls/OrbitControlAdapter.ts';
import { QualityManager } from './QualityManager.ts';

export interface SceneRenderer {
  domElement: HTMLCanvasElement;
  setSize(width: number, height: number, updateStyle: boolean): void;
  setPixelRatio(ratio: number): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
  forceContextLoss(): void;
}
export interface ScenePlatform {
  createRenderer(): SceneRenderer;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
  onResize(host: HTMLElement, callback: () => void): () => void;
  pixelRatio(): number;
  setTimer(callback: () => void, delayMs: number): number;
  clearTimer(id: number): void;
}
const browserPlatform: ScenePlatform = {
  createRenderer: () => new WebGLRenderer({ antialias: true, alpha: true }),
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  onResize: observeViewport,
  pixelRatio: () => window.devicePixelRatio,
  setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimer: (id) => window.clearTimeout(id),
};
export type ContextState = 'ready' | 'lost' | 'failed';

/** Owns only the empty rendering surface and its browser resources. */
export class SceneManager {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly rig: CameraRig;
  private readonly commands: CommandExecutor;
  private readonly host: HTMLElement;
  private readonly renderer: SceneRenderer;
  private readonly platform: ScenePlatform;
  private readonly onError: (error: unknown) => void;
  private removeResize: () => void = () => {};
  private frame: number | null = null;
  private running = false;
  private disposed = false;
  private visible = false;
  private readonly config: Readonly<AppConfig>;
  private controls: OrbitControlAdapter | undefined;
  private earth: EarthLayer | undefined;
  private readonly quality: QualityManager;
  private contextState: ContextState = 'ready';
  private contextListener: (state: ContextState) => void = () => {};
  private contextTimer: number | null = null;
  private resumeAfterRestore = false;
  private controlsWanted = false;
  private beforeRender: () => void = () => {};
  private rendered: (atMs: number) => void = () => {};
  private renderObserverErrors = 0;

  constructor(
    host: HTMLElement,
    config: Readonly<AppConfig>,
    onError: (error: unknown) => void,
    platform: ScenePlatform = browserPlatform,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.host = host;
    this.config = config;
    this.quality = new QualityManager(config);
    this.platform = platform;
    this.onError = onError;
    this.rig = new CameraRig(config);
    this.commands = new CommandExecutor(
      this.rig,
      config,
      new TransitionController(this.rig, config),
    );
    this.camera = new PerspectiveCamera(
      config.globe.fieldOfViewDeg,
      1,
      config.globe.nearClip,
      config.globe.farClip,
    );
    this.syncCamera();
    this.renderer = platform.createRenderer();
    try {
      this.renderer.domElement.setAttribute('aria-label', '地球场景');
      this.renderer.domElement.tabIndex = 0;
      host.append(this.renderer.domElement);
      this.renderer.domElement.addEventListener(
        'webglcontextlost',
        this.contextLost,
      );
      this.renderer.domElement.addEventListener(
        'webglcontextrestored',
        this.contextRestored,
      );
      this.resize();
      this.removeResize = platform.onResize(host, () => this.resize());
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  start(): void {
    if (this.disposed || this.running || this.contextState !== 'ready') return;
    this.running = true;
    this.frame = this.platform.requestFrame(this.tick);
  }
  loadEarth(onState: (state: EarthTextureState) => void): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.earth ??= new EarthLayer(this.config);
    this.earth.setAtmosphere(this.quality.getState().atmosphere);
    this.scene.add(this.earth.group);
    return this.earth.load(onState);
  }
  enableOrbitControls(sink?: OrbitInputSink): void {
    if (this.disposed) return;
    if (!this.controls && !sink) return;
    this.controls ??= new OrbitControlAdapter(
      this.camera,
      this.renderer.domElement,
      this.rig,
      this.config,
      sink!,
    );
    this.controls.enable();
    this.controlsWanted = true;
    if (this.contextState !== 'ready') this.controls.disable();
  }
  disableOrbitControls(): void {
    this.controlsWanted = false;
    this.controls?.disable();
  }
  stop(): void {
    this.resumeAfterRestore = false;
    this.running = false;
    if (this.frame !== null) this.platform.cancelFrame(this.frame);
    this.frame = null;
    this.commands.resetClock();
  }
  resize(): void {
    if (this.disposed || this.contextState !== 'ready') return;
    const { clientWidth: width, clientHeight: height } = this.host;
    this.visible = width > 0 && height > 0;
    if (!this.visible) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const ratio = this.platform.pixelRatio();
    this.renderer.setPixelRatio(
      Number.isFinite(ratio) && ratio > 0
        ? Math.min(ratio, this.quality.getState().pixelRatioCap)
        : 1,
    );
    this.renderer.setSize(width, height, false);
  }
  applyCommand(command: unknown, preserveOrbitMomentum = false): boolean {
    if (this.disposed || this.contextState !== 'ready') return false;
    const accepted = this.commands.execute(command, this.now());
    if (accepted && !preserveOrbitMomentum) this.controls?.clearMomentum();
    return accepted;
  }
  setQuality(value: unknown): boolean {
    if (this.disposed || !this.quality.set(value)) return false;
    this.earth?.setAtmosphere(this.quality.getState().atmosphere);
    this.resize();
    return true;
  }
  getQualityState() {
    return this.quality.getState();
  }
  setAutomaticQuality(value: unknown): boolean {
    if (this.disposed || !this.quality.setAutomatic(value)) return false;
    this.earth?.setAtmosphere(this.quality.getState().atmosphere);
    this.resize();
    return true;
  }
  setReducedMotion(enabled: boolean): void {
    if (this.disposed || typeof enabled !== 'boolean') return;
    this.commands.setReducedMotion(enabled);
    if (enabled) this.controls?.clearMomentum();
  }
  onContextState(listener: (state: ContextState) => void): void {
    this.contextListener = listener;
    listener(this.contextState);
  }
  private contextLost = (event: Event): void => {
    if (this.disposed || this.contextState !== 'ready') return;
    event.preventDefault();
    const wasRunning = this.running;
    this.stop();
    this.resumeAfterRestore = wasRunning;
    this.commands.suspendTransition();
    this.controls?.disable();
    this.contextState = 'lost';
    this.host.dataset.renderState = 'context-lost';
    this.contextListener('lost');
    this.contextTimer = this.platform.setTimer(() => {
      this.contextTimer = null;
      if (this.disposed || this.contextState !== 'lost') return;
      this.contextState = 'failed';
      this.resumeAfterRestore = false;
      this.host.dataset.renderState = 'failed';
      this.contextListener('failed');
    }, this.config.globe.contextRestoreTimeoutMs);
  };
  private contextRestored = (): void => {
    if (this.disposed || this.contextState !== 'lost') return;
    if (this.contextTimer !== null) this.platform.clearTimer(this.contextTimer);
    this.contextTimer = null;
    this.contextState = 'ready';
    this.resize();
    if (this.controlsWanted) this.controls?.enable();
    this.contextListener('ready');
    if (this.resumeAfterRestore) this.start();
    this.resumeAfterRestore = false;
  };
  getViewState() {
    return this.commands.getViewState();
  }
  onBeforeRender(callback: () => void): void {
    this.beforeRender = callback;
  }
  onFrameRendered(callback: (atMs: number) => void): void {
    this.rendered = callback;
  }
  getRenderObserverErrors(): number {
    return this.renderObserverErrors;
  }
  cancelTransition(): void {
    this.commands.onUserInput();
  }
  private tick = (time: number): void => {
    this.frame = null;
    if (!this.running || this.disposed) return;
    try {
      if (this.visible) {
        this.commands.update(this.now());
        this.controls?.update(time);
        this.beforeRender();
        this.syncCamera();
        this.renderer.render(this.scene, this.camera);
        this.host.dataset.renderState = 'rendered';
        try {
          this.rendered(this.now());
        } catch {
          this.renderObserverErrors++;
        }
      }
      this.frame = this.platform.requestFrame(this.tick);
    } catch (error) {
      this.stop();
      this.host.dataset.renderState = 'failed';
      this.onError(error);
    }
  };
  private syncCamera(): void {
    const { x, y, z } = this.rig.getPosition();
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.removeResize();
    if (this.contextTimer !== null) this.platform.clearTimer(this.contextTimer);
    this.contextTimer = null;
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.contextLost,
    );
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.contextRestored,
    );
    this.contextListener = () => {};
    this.beforeRender = () => {};
    this.rendered = () => {};
    this.controls?.dispose();
    this.commands.dispose();
    this.earth?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.scene.clear();
    this.host.dataset.renderState = 'disposed';
  }
}
