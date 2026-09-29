export interface ScreenPoint {
  x: number;
  y: number;
}
export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Client CSS pixels → local CSS pixels → NDC. Mirroring belongs to Camera's adapter. */
export function mapScreenPoint(
  point: ScreenPoint,
  rect: CanvasRect,
  pixelRatio = 1,
) {
  if (
    ![
      point.x,
      point.y,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      pixelRatio,
    ].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    pixelRatio <= 0
  )
    return undefined;
  const x = point.x - rect.left,
    y = point.y - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return undefined;
  const buffer = { x: x * pixelRatio, y: y * pixelRatio };
  if (!Number.isFinite(buffer.x) || !Number.isFinite(buffer.y))
    return undefined;
  return Object.freeze({
    local: Object.freeze({ x, y }),
    buffer: Object.freeze(buffer),
    ndc: Object.freeze({
      x: 2 * (x / rect.width) - 1,
      y: 1 - 2 * (y / rect.height),
    }),
  });
}
export function toNdc(point: ScreenPoint, rect: CanvasRect) {
  return mapScreenPoint(point, rect)?.ndc;
}
