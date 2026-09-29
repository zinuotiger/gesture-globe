import {
  isPlainDto,
  normalizeLongitude,
  type CityRecord,
} from '../shared/index.ts';

const validText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
export function parseCityRecords(
  value: unknown,
  minimumRecords = 100,
): readonly Readonly<CityRecord>[] {
  if (
    !Number.isSafeInteger(minimumRecords) ||
    minimumRecords < 1 ||
    !Array.isArray(value) ||
    value.length < minimumRecords ||
    !isPlainDto(value)
  )
    throw new TypeError('Invalid city dataset');
  const ids = new Set<string>();
  return Object.freeze(
    value.map((item: unknown) => {
      if (!item || typeof item !== 'object')
        throw new TypeError('Invalid city record');
      const row = item as Record<string, unknown>;
      if (
        row.schemaVersion !== 1 ||
        !validText(row.id) ||
        !/^[a-z0-9-]+$/.test(row.id) ||
        ids.has(row.id) ||
        !validText(row.name) ||
        !validText(row.countryOrRegion) ||
        typeof row.latitude !== 'number' ||
        !Number.isFinite(row.latitude) ||
        Math.abs(row.latitude) > 90 ||
        typeof row.longitude !== 'number' ||
        !Number.isFinite(row.longitude) ||
        row.longitude < -180 ||
        row.longitude >= 180 ||
        (row.aliases !== undefined &&
          (!Array.isArray(row.aliases) || !row.aliases.every(validText))) ||
        (row.populationBand !== undefined &&
          !['GLOBAL', 'REGIONAL', 'LOCAL'].includes(String(row.populationBand)))
      )
        throw new TypeError('Invalid or duplicate city record');
      ids.add(row.id);
      return Object.freeze({
        schemaVersion: 1 as const,
        id: row.id,
        name: row.name,
        countryOrRegion: row.countryOrRegion,
        latitude: row.latitude,
        longitude: row.longitude,
        ...(row.aliases
          ? { aliases: Object.freeze([...(row.aliases as string[])]) }
          : {}),
      });
    }),
  );
}

/** Mean spherical Earth radius in kilometres; mathematical unit conversion, not a tuning threshold. */
const EARTH_RADIUS_KM = 6371.0088;
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (
    ![lat1, lon1, lat2, lon2].every(Number.isFinite) ||
    Math.abs(lat1) > 90 ||
    Math.abs(lat2) > 90
  )
    throw new RangeError('Invalid geographic coordinate');
  const radians = Math.PI / 180,
    latitude = (lat2 - lat1) * radians;
  const longitude =
    normalizeLongitude(normalizeLongitude(lon2) - normalizeLongitude(lon1)) *
    radians;
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(lat1 * radians) *
      Math.cos(lat2 * radians) *
      Math.sin(longitude / 2) ** 2;
  return (
    2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))))
  );
}
export class CityIndex {
  private readonly cities: readonly Readonly<CityRecord>[];
  constructor(
    records: readonly CityRecord[],
    private readonly thresholdKm: number,
  ) {
    if (!Number.isFinite(thresholdKm) || thresholdKm < 0)
      throw new RangeError('Invalid city threshold');
    this.cities = parseCityRecords(records, 1);
  }
  get size() {
    return this.cities.length;
  }
  nearest(latitude: number, longitude: number) {
    let best: Readonly<CityRecord> | undefined,
      distance = Infinity;
    for (const city of this.cities) {
      const candidate = haversineKm(
        latitude,
        longitude,
        city.latitude,
        city.longitude,
      );
      if (
        candidate < distance ||
        (candidate === distance && best && city.id < best.id)
      ) {
        best = city;
        distance = candidate;
      }
    }
    return best && distance <= this.thresholdKm
      ? Object.freeze({
          id: best.id,
          name: best.name,
          countryOrRegion: best.countryOrRegion,
          distanceKm: distance,
        })
      : undefined;
  }
}
