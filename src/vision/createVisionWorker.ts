import entryUrl from './vision.worker.ts?worker&url';

/** A classic host keeps SDK importScripts valid in Vite dev and production. */
export function createVisionWorker(): Worker {
  const entry = new URL(entryUrl, location.href);
  const bootstrap = new URL(
    '/models/vision-worker-bootstrap.js',
    location.href,
  );
  bootstrap.searchParams.set('entry', entry.href);
  return new Worker(bootstrap, { name: 'gesture-globe-vision' });
}
