import { magneticTile } from "../offscreen/scenes/PersistentScene/Grid/magneticTile.js";
import { mobileSettings as mobile } from "./mobileSettings.js";

// Home camera and grid offset the layout is framed against. The canvas center
// ray hits the grid through look-at, which is an idle cell; a raised reticle
// (visible height shorter than the large viewport) falls into a project magnet.
const CURSOR_CAMERA = { x: 0, y: 7, z: 60, gridY: 2, fovPortrait: 54, fovLandscape: 46, snap: 1.05 };

/** A small portrait/landscape grid, with enough cells for every project. */
export function touchGridLayout(width, height, projectCount) {
  const portrait = width < height;
  const cols = portrait ? mobile.portraitColumns : mobile.landscapeColumns;
  const rows = Math.max(portrait ? mobile.portraitRows : mobile.landscapeRows, Math.ceil(projectCount / cols));
  // Fixed design envelope: the grid stays still while scene-specific FOVs blend.
  const viewHeight = 2 * 60 * Math.tan((portrait ? 54 : 46) * Math.PI / 360);
  const cell = Math.min(viewHeight * width / height * mobile.gridWidth / cols, viewHeight * mobile.gridHeight / rows);
  return { cols, rows, tileSize: cell * (1 - mobile.tileGap), cellSize: cell };
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

function gridMetrics(layout) {
  const gap = layout.cellSize - layout.tileSize;
  const width = layout.cols * layout.cellSize - gap;
  const height = layout.rows * layout.cellSize - gap;
  return {
    ...layout, width, height,
    originX: -width / 2 + layout.tileSize / 2,
    originY: -height / 2 + layout.tileSize / 2,
  };
}

/** World hit on the grid plane (z = 0) for an NDC point through the home camera. */
function rayOnGrid(width, height, ndcX, ndcY, camera) {
  const fov = ((width < height ? camera.fovPortrait : camera.fovLandscape) * Math.PI) / 180;
  const aspect = width / height;
  const focal = 1 / Math.tan(fov / 2);
  const fx = -camera.x, fy = -camera.y, fz = -camera.z;
  const fl = Math.hypot(fx, fy, fz);
  const forward = [fx / fl, fy / fl, fz / fl];
  const rx = -forward[2], rz = forward[0];
  const rl = Math.hypot(rx, rz);
  const right = [rx / rl, 0, rz / rl];
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const sx = ndcX * aspect / focal;
  const sy = ndcY / focal;
  const dz = right[2] * sx + up[2] * sy + forward[2];
  const t = -camera.z / dz;
  return [
    camera.x + (right[0] * sx + up[0] * sy + forward[0]) * t,
    camera.y + (right[1] * sx + up[1] * sy + forward[1]) * t,
  ];
}

function tileAt(localX, localY, metrics) {
  if (Math.abs(localX) > metrics.width / 2 || Math.abs(localY) > metrics.height / 2) return -1;
  const col = Math.min(metrics.cols - 1, Math.max(0, Math.floor((localX + metrics.width / 2) / metrics.cellSize)));
  const row = Math.min(metrics.rows - 1, Math.max(0, Math.floor((localY + metrics.height / 2) / metrics.cellSize)));
  return row * metrics.cols + col;
}

/** Project index under a canvas pixel, or -1 when the magnet does not claim a project. */
export function touchProjectAtPoint(width, height, x, y, positions, camera = CURSOR_CAMERA) {
  const metrics = gridMetrics(touchGridLayout(width, height, positions.length));
  const active = new Set(uniqueProjectTiles(positions, metrics.cols, metrics.rows));
  const ndcX = (x / width) * 2 - 1;
  const ndcY = 1 - (y / height) * 2;
  const [wx, wy] = rayOnGrid(width, height, ndcX, ndcY, camera);
  const localX = wx;
  const localY = wy - camera.gridY;
  const index = tileAt(localX, localY, metrics);
  if (index < 0) return -1;
  return magneticTile(localX, localY, index, active, {
    cols: metrics.cols, cellSize: metrics.cellSize,
    originX: metrics.originX, originY: metrics.originY, range: camera.snap,
  });
}

/** Canvas pixel on a non-project tile, outside the hover magnet. Center first. */
export function touchCursorPoint(width, height, positions, camera = CURSOR_CAMERA) {
  const candidates = [[0, 0]];
  for (let ring = 1; ring <= 10; ring++) {
    const radius = ring * 0.06;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      candidates.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
  }
  for (const [ndcX, ndcY] of candidates) {
    if (Math.abs(ndcX) > 0.9 || Math.abs(ndcY) > 0.9) continue;
    const x = (ndcX * 0.5 + 0.5) * width;
    const y = (0.5 - ndcY * 0.5) * height;
    if (touchProjectAtPoint(width, height, x, y, positions, camera) < 0) return { x, y };
  }
  return { x: width * 0.5, y: height * 0.5 };
}
