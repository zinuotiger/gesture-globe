/** Container, fullscreen, window and monitor-DPR changes share one resize path. */
export function observeViewport(
  host: HTMLElement,
  resize: () => void,
): () => void {
  const view = host.ownerDocument.defaultView;
  if (!view) throw new Error('Viewport has no owning window');
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  view.addEventListener('resize', resize);
  host.ownerDocument.addEventListener('fullscreenchange', resize);
  let resolution = view.matchMedia(
    `(resolution: ${view.devicePixelRatio}dppx)`,
  );
  const changed = () => {
    resolution.removeEventListener('change', changed);
    resolution = view.matchMedia(`(resolution: ${view.devicePixelRatio}dppx)`);
    resolution.addEventListener('change', changed);
    resize();
  };
  resolution.addEventListener('change', changed);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    view.removeEventListener('resize', resize);
    host.ownerDocument.removeEventListener('fullscreenchange', resize);
    resolution.removeEventListener('change', changed);
  };
}
