/** One navigation per wheel gesture, released by a pause or a direction change. */
export function createWheelGesture({ threshold = 48, idleMs = 180 } = {}) {
  let lastAt = -Infinity;
  let direction = 0;
  let distance = 0;
  let consumed = false;

  return {
    read(event, now, pageHeight) {
      // Wheel units are pixels, lines, or pages depending on the input device.
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1;
      const dy = event.deltaY * unit;
      const dx = event.deltaX * unit;
      if (event.ctrlKey || !Number.isFinite(dy) || !dy || Math.abs(dx) > Math.abs(dy)) return 0;

      const nextDirection = Math.sign(dy);
      if (now - lastAt >= idleMs || nextDirection !== direction) {
        distance = 0;
        consumed = false;
      }
      lastAt = now;
      direction = nextDirection;
      if (consumed) return 0;

      distance += dy;
      if (Math.abs(distance) < threshold) return 0;
      consumed = true;
      return direction;
    },
    consume() {
      // Keep tracking momentum across scene changes and native scroll areas.
      consumed = true;
      distance = 0;
    },
  };
}
