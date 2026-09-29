import type { AppConfig } from '../../config/index.ts';

export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Size, Point {}
export type ObjectFit = 'cover' | 'contain';
function validSize(size: Size): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}
export function computeObjectFitRect(
  source: Size,
  container: Size,
  fit: ObjectFit,
): (Rect & { scale: number }) | undefined {
  if (
    !validSize(source) ||
    !validSize(container) ||
    !['cover', 'contain'].includes(fit)
  )
    return undefined;
  const scale = (fit === 'cover' ? Math.max : Math.min)(
    container.width / source.width,
    container.height / source.height,
  );
  const width = source.width * scale,
    height = source.height * scale;
  if (![scale, width, height].every(Number.isFinite)) return undefined;
  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
    scale,
  };
}
function inside(point: Point, rect: Rect): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x <= rect.x + rect.width &&
    point.y <= rect.y + rect.height
  );
}
/** Pure, one mirror boundary. Inputs/outputs are CSS pixels, independent of DPR. */
export class CoordinateAdapter {
  private readonly container: Readonly<Size>;
  private readonly fitted: ReturnType<typeof computeObjectFitRect>;
  constructor(
    source: Size,
    container: Size,
    private readonly config: Readonly<AppConfig>,
    fit: ObjectFit = 'cover',
  ) {
    this.container = Object.freeze({ ...container });
    this.fitted = computeObjectFitRect(source, container, fit);
  }
  private validDisplay(point: Point): boolean {
    return (
      !!this.fitted &&
      inside(point, { x: 0, y: 0, ...this.container }) &&
      inside(point, this.fitted)
    );
  }
  modelToDisplay(point: Point): Point | undefined {
    if (!this.fitted || !inside(point, { x: 0, y: 0, width: 1, height: 1 }))
      return undefined;
    const mapped = {
      x:
        this.fitted.x +
        (this.config.camera.previewMirror ? 1 - point.x : point.x) *
          this.fitted.width,
      y: this.fitted.y + point.y * this.fitted.height,
    };
    return this.validDisplay(mapped) ? mapped : undefined;
  }
  displayToModel(point: Point): Point | undefined {
    if (!this.fitted || !this.validDisplay(point)) return undefined;
    const x = (point.x - this.fitted.x) / this.fitted.width;
    return {
      x: this.config.camera.previewMirror ? 1 - x : x,
      y: (point.y - this.fitted.y) / this.fitted.height,
    };
  }
  displayToCanvas(
    point: Point,
    canvas: Rect,
    mode: 'safeRect' | 'fullViewport' = this.config.geo.pointerMode,
  ): { local: Point; client: Point } | undefined {
    if (
      !this.validDisplay(point) ||
      !validSize(canvas) ||
      !Number.isFinite(canvas.x) ||
      !Number.isFinite(canvas.y) ||
      !['safeRect', 'fullViewport'].includes(mode)
    )
      return undefined;
    const ix = mode === 'safeRect' ? this.config.geo.safeInsetX : 0;
    const iy = mode === 'safeRect' ? this.config.geo.safeInsetY : 0;
    const local = {
      x: canvas.width * (ix + (point.x / this.container.width) * (1 - 2 * ix)),
      y:
        canvas.height * (iy + (point.y / this.container.height) * (1 - 2 * iy)),
    };
    return { local, client: { x: canvas.x + local.x, y: canvas.y + local.y } };
  }
}
