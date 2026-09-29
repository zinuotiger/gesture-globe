export type OverlayPoint = Readonly<{ x: number; y: number }>;
// Public 21-landmark topology; coordinates are already mirrored/cropped by App.
const chains = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [5, 9, 10, 11, 12],
  [9, 13, 14, 15, 16],
  [13, 17, 18, 19, 20],
  [0, 17],
];
export function createCameraOverlay(document: Document) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  element.classList.add('camera-overlay');
  element.setAttribute('aria-hidden', 'true');
  let visible = true;
  return {
    element,
    clear() {
      element.replaceChildren();
    },
    setVisible(value: boolean) {
      visible = value;
      element.style.display = value ? '' : 'none';
      if (!value) element.replaceChildren();
    },
    update(hands: readonly (readonly OverlayPoint[])[], size: OverlayPoint) {
      element.replaceChildren();
      if (!visible || !(size.x > 0 && size.y > 0)) return;
      element.setAttribute('viewBox', `0 0 ${size.x} ${size.y}`);
      for (const points of hands) {
        if (
          points.length !== 21 ||
          points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
        )
          continue;
        for (const chain of chains) {
          const line = document.createElementNS(
            element.namespaceURI,
            'polyline',
          );
          line.setAttribute(
            'points',
            chain.map((i) => `${points[i]!.x},${points[i]!.y}`).join(' '),
          );
          element.append(line);
        }
        for (const point of points) {
          const dot = document.createElementNS(element.namespaceURI, 'circle');
          dot.setAttribute('cx', String(point.x));
          dot.setAttribute('cy', String(point.y));
          dot.setAttribute('r', '2');
          element.append(dot);
        }
      }
    },
  };
}
