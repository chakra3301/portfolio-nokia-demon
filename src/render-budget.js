// Bound full-screen buffers rather than multiplying a 4K/ultrawide display by
// a Retina pixel ratio. DOM typography stays at the display's native resolution.
export function budgetPixelRatio(width, height, ratio, maxPixels) {
  const capped = Math.min(ratio, Math.sqrt(maxPixels / Math.max(1, width * height)));
  // Three floors buffer sizes; the ambient SDK rounds them. Leave half a pixel
  // on the shorter edge when rounding would exceed the shared pixel budget.
  return Math.round(width * capped) * Math.round(height * capped) > maxPixels
    ? capped - 0.5 / Math.max(1, Math.min(width, height))
    : capped;
}

export const INSTRUMENT_MAX_PIXELS = 4_000_000;
export const AMBIENT_MAX_PIXELS = 2_500_000;

export function createFrameLimiter(fps) {
  const interval = 1000 / fps;
  let last = 0;
  return (now) => {
    const elapsed = now - last;
    if (elapsed < interval - 0.5) return false;
    last = elapsed > interval * 2 ? now : now - Math.max(0, elapsed - interval);
    return true;
  };
}
