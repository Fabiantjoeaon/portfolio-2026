/** A small portrait/landscape grid, with enough cells for every project. */
export function touchGridLayout(width, height, projectCount) {
  const portrait = width < height;
  const cols = portrait ? 6 : 10;
  const rows = Math.max(portrait ? 8 : 5, Math.ceil(projectCount / cols));
  const gap = 0.1;
  // The home cameras stay inside their rooms; fit the grid, not camera distance.
  const viewHeight = 2 * 60 * Math.tan((portrait ? 40 : 34) * Math.PI / 360);
  const cell = Math.min(viewHeight * width / height * 0.82 / cols, viewHeight * (portrait ? 0.56 : 0.46) / rows);
  return { cols, rows, tileSize: cell - gap, cellSize: cell };
}

/** Resolve collisions deterministically instead of silently dropping a project. */
export function uniqueProjectTiles(positions, cols, rows) {
  if (positions.length > cols * rows) throw new Error('Not enough project tiles');
  const used = new Set();
  return positions.map(([x, y]) => {
    let best = -1, distance = Infinity;
    for (let index = 0; index < cols * rows; index++) {
      if (used.has(index)) continue;
      const d = (index % cols - x * (cols - 1)) ** 2 + (Math.floor(index / cols) - y * (rows - 1)) ** 2;
      if (d < distance) { best = index; distance = d; }
    }
    used.add(best);
    return best;
  });
}
