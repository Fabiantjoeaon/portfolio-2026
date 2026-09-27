import { mobileSettings as mobile } from "./mobileSettings.js";

/** A small portrait/landscape grid, with enough cells for every project. */
export function touchGridLayout(width, height, projectCount) {
  const portrait = width < height;
  const cols = portrait ? mobile.portraitColumns : mobile.landscapeColumns;
  const rows = Math.max(portrait ? mobile.portraitRows : mobile.landscapeRows, Math.ceil(projectCount / cols));
  const gap = 0.1;
  // Fixed design envelope: the grid stays still while scene-specific FOVs blend.
  const viewHeight = 2 * 60 * Math.tan((portrait ? 54 : 46) * Math.PI / 360);
  const cell = Math.min(viewHeight * width / height * mobile.gridWidth / cols, viewHeight * mobile.gridHeight / rows);
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
