/** Unknown boundary input is accepted only as plain finite cloneable data. */
export function isPlainDto(
  value: unknown,
  ancestors = new Set<object>(),
): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  )
    return false;
  ancestors.add(value);
  const valid = Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor !== undefined &&
      'value' in descriptor &&
      isPlainDto(descriptor.value, ancestors)
    );
  });
  ancestors.delete(value);
  return valid;
}

export function assertSchemaVersion(
  value: unknown,
): asserts value is { schemaVersion: 1 } {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1
  ) {
    throw new TypeError('Unsupported schemaVersion; expected 1.');
  }
}

export function assertEventEnvelope(value: unknown): void {
  assertSchemaVersion(value);
  if (!isPlainDto(value))
    throw new TypeError('Event must contain plain finite data only.');
  const envelope = value as Record<string, unknown>;
  if (
    typeof envelope.eventId !== 'string' ||
    !envelope.eventId ||
    typeof envelope.type !== 'string' ||
    !envelope.type ||
    typeof envelope.atMs !== 'number' ||
    envelope.atMs < 0 ||
    typeof envelope.source !== 'string' ||
    !/^M(0[1-9]|1[0-2])$/.test(envelope.source) ||
    !('payload' in envelope)
  )
    throw new TypeError('Invalid event metadata.');
  for (const key of ['sessionId', 'traceId']) {
    if (
      key in envelope &&
      (typeof envelope[key] !== 'string' || !envelope[key])
    )
      throw new TypeError(`Invalid ${key}.`);
  }
}
