let previous = 0;
/** Shared epoch milliseconds. Normal operation uses monotonic Performance time;
 * unavailable/invalid Performance API falls back to coarse, nondecreasing Date time. */
export const monotonicNow = () => {
  let measured: number;
  try {
    measured = performance.timeOrigin + performance.now();
  } catch {
    measured = NaN;
  }
  if (!Number.isFinite(measured) || measured < 0) measured = Date.now();
  if (Number.isFinite(measured) && measured >= 0)
    previous = Math.max(previous, measured);
  return previous;
};
