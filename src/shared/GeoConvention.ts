/** Section 18.10 texture-aligned option: north = +Y, longitude = atan2(-z, x) + offset. */
export function geoToDirection(
  lat: number,
  lon: number,
  longitudeOffsetDeg: number,
) {
  const latitude = (lat * Math.PI) / 180;
  const longitude = ((lon - longitudeOffsetDeg) * Math.PI) / 180;
  return {
    x: Math.cos(latitude) * Math.cos(longitude),
    y: Math.sin(latitude),
    z: -Math.cos(latitude) * Math.sin(longitude),
  };
}

export function normalizeLongitude(longitude: number): number {
  if (!Number.isFinite(longitude))
    throw new RangeError('Longitude must be finite');
  return (((longitude % 360) + 540) % 360) - 180;
}

/** Inverse of the single texture convention above; sphere center is the origin. */
export function directionToGeo(
  point: Readonly<{ x: number; y: number; z: number }>,
  longitudeOffsetDeg: number,
) {
  if (![point.x, point.y, point.z, longitudeOffsetDeg].every(Number.isFinite))
    return undefined;
  const scale = Math.max(
    Math.abs(point.x),
    Math.abs(point.y),
    Math.abs(point.z),
  );
  if (scale === 0) return undefined;
  const x = point.x / scale,
    y = point.y / scale,
    z = point.z / scale;
  const radius = Math.hypot(x, y, z);
  return Object.freeze({
    latitude:
      (Math.asin(Math.max(-1, Math.min(1, y / radius))) * 180) / Math.PI,
    longitude: normalizeLongitude(
      (Math.atan2(-z, x) * 180) / Math.PI + longitudeOffsetDeg,
    ),
  });
}
