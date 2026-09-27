/** Extra attraction distance in grid cells; direct project hits always win. */
export function magneticTile(x, y, pointerIndex, activeIndices, { cols, cellSize, originX, originY, range }) {
  if (activeIndices.has(pointerIndex)) return pointerIndex;
  if (!(range > 0)) return -1;
  const radius = cellSize * (0.5 + range);
  let nearest = -1;
  let best = radius * radius;
  for (const index of activeIndices) {
    const dx = x - (originX + index % cols * cellSize);
    const dy = y - (originY + Math.floor(index / cols) * cellSize);
    const distance = dx * dx + dy * dy;
    if (distance < best) { best = distance; nearest = index; }
  }
  return nearest;
}
