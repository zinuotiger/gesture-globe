import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhongMaterial,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import type { Texture } from 'three';
import { earthTextureUrl } from '../config/index.ts';
import type { AppConfig } from '../config/index.ts';

export type EarthTextureState = 'loading' | 'ready' | 'failed';
export function earthGeometry(
  radius: number,
  width: number,
  height: number,
): SphereGeometry {
  // Three's original UVs agree with GeoConvention's -Z-east longitude.
  return new SphereGeometry(radius, width, height);
}
export class EarthLayer {
  readonly group = new Group();
  readonly earth: Mesh<SphereGeometry, MeshPhongMaterial>;
  private readonly atmosphere: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly stars: Points<BufferGeometry, PointsMaterial>;
  private readonly ambient: AmbientLight;
  private readonly sun: DirectionalLight;
  private texture: Texture | undefined;
  private disposed = false;
  private loading: Promise<void> | undefined;
  private readonly textureRetries: number;
  constructor(config: Readonly<AppConfig>) {
    this.textureRetries = config.earth.textureRetries;
    const cfg = config.earth;
    this.earth = new Mesh(
      earthGeometry(
        config.globe.earthRadius,
        cfg.widthSegments,
        cfg.heightSegments,
      ),
      new MeshPhongMaterial({ color: 0x7ba7b8, shininess: cfg.shininess }),
    );
    this.earth.name = 'earth';
    this.group.add(this.earth);
    this.ambient = new AmbientLight(0xffffff, cfg.ambientIntensity);
    this.sun = new DirectionalLight(0xfff4e1, cfg.sunIntensity);
    this.sun.position.set(cfg.sunX, cfg.sunY, cfg.sunZ);
    this.group.add(this.ambient, this.sun);
    this.atmosphere = new Mesh(
      new SphereGeometry(
        config.globe.earthRadius * cfg.atmosphereScale,
        cfg.widthSegments,
        cfg.heightSegments,
      ),
      new ShaderMaterial({
        vertexShader:
          'varying vec3 vNormal; varying vec3 vPosition; void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); vNormal=normalize(normalMatrix*normal); vPosition=p.xyz; gl_Position=projectionMatrix*p; }',
        fragmentShader:
          'varying vec3 vNormal; varying vec3 vPosition; uniform float strength; void main(){ float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(-vPosition))),3.0); gl_FragColor=vec4(0.22,0.58,0.90,rim*strength); }',
        uniforms: { strength: { value: cfg.atmosphereStrength } },
        side: BackSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.atmosphere.name = 'atmosphere';
    this.group.add(this.atmosphere);
    const positions = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < cfg.starCount; i++) {
      const y = 1 - (2 * (i + 0.5)) / cfg.starCount;
      const radius = Math.sqrt(1 - y * y);
      positions.push(
        cfg.starRadius * radius * Math.cos(i * goldenAngle),
        cfg.starRadius * y,
        cfg.starRadius * radius * Math.sin(i * goldenAngle),
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.stars = new Points(
      geometry,
      new PointsMaterial({
        color: 0xbdd3e5,
        size: cfg.starSize,
        sizeAttenuation: false,
        transparent: true,
        opacity: cfg.starOpacity,
        depthWrite: false,
      }),
    );
    this.stars.name = 'stars';
    this.group.add(this.stars);
  }
  setAtmosphere(visible: boolean): void {
    if (!this.disposed) this.atmosphere.visible = visible;
  }
  load(
    onState: (state: EarthTextureState) => void,
    loader: (url: string) => Promise<Texture> = (url) =>
      new TextureLoader().loadAsync(url),
    reload = false,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.loading) return this.loading;
    if (this.texture && !reload) {
      onState('ready');
      return Promise.resolve();
    }
    const acquire = async (): Promise<Texture> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await loader(earthTextureUrl());
        } catch (error) {
          if (this.disposed || attempt >= this.textureRetries) throw error;
        }
      }
    };
    const operation: Promise<void> = Promise.resolve()
      .then(acquire)
      .then((texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        const previous = this.texture;
        this.texture = texture;
        texture.colorSpace = SRGBColorSpace;
        this.earth.material.map = texture;
        this.earth.material.color.set(0xffffff);
        this.earth.material.needsUpdate = true;
        if (previous && previous !== texture) previous.dispose();
        onState('ready');
      })
      .catch(() => {
        if (!this.disposed) onState('failed');
      })
      .finally(() => {
        if (this.loading === operation) this.loading = undefined;
      });
    this.loading = operation;
    onState('loading');
    return operation;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.texture?.dispose();
    for (const object of [this.earth, this.atmosphere, this.stars]) {
      object.geometry.dispose();
      object.material.dispose();
    }
    this.sun.dispose();
    this.ambient.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}
