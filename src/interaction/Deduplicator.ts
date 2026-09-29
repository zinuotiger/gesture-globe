/** Bounded FIFO of accepted event identities; duplicate reads do not refresh retention. */
export class Deduplicator {
  private readonly ids = new Set<string>();
  constructor(private readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new RangeError('Invalid dedup capacity');
  }
  seen(id: string): boolean {
    return this.ids.has(id);
  }
  remember(id: string): boolean {
    if (typeof id !== 'string' || !id.trim())
      throw new TypeError('Invalid event id');
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    if (this.ids.size > this.capacity)
      this.ids.delete(this.ids.values().next().value!);
    return true;
  }
  get size(): number {
    return this.ids.size;
  }
  clear(): void {
    this.ids.clear();
  }
}
