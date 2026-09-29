import { BitmapOwnership } from '../../src/vision/index.ts';
const owner = new BitmapOwnership();
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(value: unknown): void;
};
scope.onmessage = (event) => {
  const request = event.data;
  void owner
    .process(request, (_, metadata) => {
      if (request.injectFailure)
        throw new Error('Explicit synthetic ownership fault');
      return metadata;
    })
    .then(
      (metadata) =>
        scope.postMessage({
          metadata,
          closedWidth: request.bitmap.width,
          metrics: owner.getMetrics(),
        }),
      () =>
        scope.postMessage({
          error: 'SYNTHETIC_FAULT',
          closedWidth: request.bitmap.width,
          metrics: owner.getMetrics(),
        }),
    );
};
