import type { GeoSelection } from '../shared/index.ts';
import type { CityIndex } from './CityIndex.ts';

export interface LocationState {
  readonly selection: Readonly<GeoSelection> | null;
  readonly cityStatus: 'EMPTY' | 'LOADING' | 'MATCHED' | 'UNMATCHED' | 'ERROR';
}
/** The selected coordinate is immediate. Asynchronous enrichment never owns selection. */
export class LocationSelection {
  private state: LocationState = Object.freeze({
    selection: null,
    cityStatus: 'EMPTY',
  });
  private generation = 0;
  private disposed = false;
  private request: AbortController | undefined;
  constructor(
    private readonly load: (
      signal: AbortSignal,
    ) => Promise<Pick<CityIndex, 'nearest'>>,
    private readonly publish: (state: LocationState) => void,
  ) {}
  getState() {
    return this.state;
  }
  private set(state: LocationState) {
    this.state = Object.freeze(state);
    this.publish(this.state);
  }
  async select(value: Readonly<GeoSelection>): Promise<void> {
    if (this.disposed) return;
    if (
      value.schemaVersion !== 1 ||
      !value.selectionId.trim() ||
      ![value.selectedAtMs, value.latitude, value.longitude].every(
        Number.isFinite,
      ) ||
      value.selectedAtMs < 0 ||
      Math.abs(value.latitude) > 90 ||
      value.longitude < -180 ||
      value.longitude >= 180
    )
      throw new TypeError('Invalid location selection');
    // Do not trust or reuse city data supplied with an incoming coordinate.
    const selection = Object.freeze({
      schemaVersion: 1 as const,
      selectionId: value.selectionId,
      selectedAtMs: value.selectedAtMs,
      latitude: value.latitude,
      longitude: value.longitude,
    });
    const generation = ++this.generation;
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    this.set({ selection, cityStatus: 'LOADING' });
    const current = () =>
      !this.disposed &&
      generation === this.generation &&
      !request.signal.aborted &&
      this.state.selection?.selectionId === selection.selectionId;
    try {
      const index = await this.load(request.signal);
      if (!current()) return;
      const nearestCity = index.nearest(
        selection.latitude,
        selection.longitude,
      );
      if (!current()) return;
      this.set({
        selection: Object.freeze({
          ...selection,
          ...(nearestCity ? { nearestCity } : {}),
        }),
        cityStatus: nearestCity ? 'MATCHED' : 'UNMATCHED',
      });
    } catch {
      if (current()) this.set({ selection, cityStatus: 'ERROR' });
    }
  }
  clear(): void {
    ++this.generation;
    this.request?.abort();
    this.request = undefined;
    this.set({ selection: null, cityStatus: 'EMPTY' });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
  }
}
