export interface PointingPresentation {
  pointer: Readonly<{ x: number; y: number }> | null;
  center: Readonly<{ x: number; y: number }> | null;
  hit: boolean;
  progress: number;
  phase: string;
}
/** All timing belongs to DwellSelector. This view never advances progress. */
export function createPointingFeedback(document: Document, radius: number) {
  const element = document.createElement('div');
  element.className = 'pointing-feedback';
  element.hidden = true;
  element.setAttribute('aria-hidden', 'true');
  const pointer = document.createElement('span');
  pointer.className = 'pointing-cursor';
  const label = document.createElement('span');
  label.className = 'pointing-label';
  pointer.append(label);
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.classList.add('dwell-ring');
  ring.setAttribute('viewBox', '0 0 100 100');
  ring.setAttribute('preserveAspectRatio', 'none');
  const arc = document.createElementNS(ring.namespaceURI, 'circle');
  for (const [key, value] of Object.entries({
    cx: '50',
    cy: '50',
    r: '46',
    pathLength: '1',
  }))
    arc.setAttribute(key, value);
  ring.append(arc);
  element.append(pointer, ring);
  let previous = '';
  return {
    element,
    update(value: PointingPresentation) {
      const key = JSON.stringify(value);
      if (key === previous) return;
      previous = key;
      element.hidden = !value.pointer;
      element.dataset.hit = String(value.hit);
      element.dataset.phase = value.phase;
      element.dataset.progress = String(value.progress);
      if (value.pointer) {
        pointer.style.left = `${100 * value.pointer.x}%`;
        pointer.style.top = `${100 * value.pointer.y}%`;
      }
      label.textContent = value.hit ? '命中地球' : '未命中地球';
      ring.style.display = value.center && value.hit ? '' : 'none';
      if (value.center) {
        ring.style.left = `${100 * value.center.x}%`;
        ring.style.top = `${100 * value.center.y}%`;
      }
      ring.style.width = ring.style.height = `${200 * radius}%`;
      arc.setAttribute('stroke-dasharray', `${value.progress} 1`);
    },
    dispose() {
      element.remove();
    },
  };
}
