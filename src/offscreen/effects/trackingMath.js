// Inclusive slab test: grazing an obstacle counts as blocked too.
export function segmentIntersectsBounds(a, b, min, max, dimensions = 3) {
  let enter = 0, exit = 1;
  for (let axis = 0; axis < dimensions; axis++) {
    const key = axis === 0 ? "x" : axis === 1 ? "y" : "z";
    const delta = b[key] - a[key];
    if (Math.abs(delta) < 1e-9) {
      if (a[key] < min[key] || a[key] > max[key]) return false;
      continue;
    }
    const t0 = (min[key] - a[key]) / delta;
    const t1 = (max[key] - a[key]) / delta;
    enter = Math.max(enter, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (enter > exit) return false;
  }
  return true;
}

export function trackingRandom(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function trackingSmooth(start, end, value) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}
