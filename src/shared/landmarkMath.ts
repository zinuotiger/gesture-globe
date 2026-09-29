import type { NormalizedPoint } from './contracts.ts';

export interface Point2 {
  readonly x: number;
  readonly y: number;
}
export interface Bounds2 {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
const point2 = (p: unknown): p is Point2 =>
  !!p &&
  typeof p === 'object' &&
  'x' in p &&
  'y' in p &&
  typeof p.x === 'number' &&
  Number.isFinite(p.x) &&
  typeof p.y === 'number' &&
  Number.isFinite(p.y);
export function validLandmarks(
  points: unknown,
): points is readonly NormalizedPoint[] {
  return (
    Array.isArray(points) &&
    points.length === 21 &&
    points.every(
      (p) =>
        point2(p) &&
        'z' in p &&
        typeof p.z === 'number' &&
        Number.isFinite(p.z),
    )
  );
}
/** Image-plane geometry: Z is preserved in DTOs, not mixed into projected distances. */
export function distance(a: unknown, b: unknown): number | undefined {
  if (!point2(a) || !point2(b)) return undefined;
  const value = Math.hypot(a.x - b.x, a.y - b.y);
  return Number.isFinite(value) ? value : undefined;
}
export function palmCenter(points: unknown): NormalizedPoint | undefined {
  if (!validLandmarks(points)) return undefined;
  const indices = [0, 5, 9, 13, 17];
  return indices.reduce(
    (sum, index) => {
      const p = points[index]!;
      return {
        x: sum.x + p.x / indices.length,
        y: sum.y + p.y / indices.length,
        z: sum.z + p.z / indices.length,
      };
    },
    { x: 0, y: 0, z: 0 },
  );
}
export function palmWidth(points: unknown): number | undefined {
  return validLandmarks(points) ? distance(points[5], points[17]) : undefined;
}
export function bbox(points: unknown): Bounds2 | undefined {
  if (!validLandmarks(points)) return undefined;
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  const width = Math.max(...xs) - x,
    height = Math.max(...ys) - y;
  return Number.isFinite(width) && Number.isFinite(height)
    ? { x, y, width, height }
    : undefined;
}
export function pinchRatio(
  points: unknown,
  epsilon: number,
): number | undefined {
  if (!validLandmarks(points) || !Number.isFinite(epsilon) || epsilon <= 0)
    return undefined;
  const width = palmWidth(points),
    gap = distance(points[4], points[8]);
  if (width === undefined || gap === undefined) return undefined;
  const ratio = gap / Math.max(width, epsilon);
  return Number.isFinite(ratio) ? ratio : undefined;
}
export function velocity(
  previous: unknown,
  current: unknown,
  dtMs: number,
): (Point2 & { readonly speed: number }) | undefined {
  if (
    !point2(previous) ||
    !point2(current) ||
    !Number.isFinite(dtMs) ||
    dtMs <= 0
  )
    return undefined;
  const x = ((current.x - previous.x) / dtMs) * 1000;
  const y = ((current.y - previous.y) / dtMs) * 1000;
  const speed = Math.hypot(x, y);
  return Number.isFinite(speed) ? { x, y, speed } : undefined;
}
