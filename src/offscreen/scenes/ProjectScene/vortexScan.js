import { exp, float, floor, fract, fwidth, hash, log, max, smoothstep, step, vec2, vec3 } from "three/tsl";
import { getLookup } from "../../transitions/digitalWipe.js";

const TAU = Math.PI * 2;

const stroke = (distance, width) => float(1).sub(smoothstep(float(0.006).sub(width).max(0), float(0.006).add(width), distance));

/** Brightness of the pulse plane where a view ray meets it at `depth`. */
export function scanShell(u, depth) {
  return exp(log(depth.div(u.scanDepth)).abs().mul(-9)).mul(u.scanStrength);
}

/**
 * Digital scan pulse on the front tube wall, in the digital wipe's marker
 * language. Cells live in log-polar space so they stay square on screen while
 * the pulse front (u.scanDepth) races from the core towards the viewer.
 */
export function vortexScan(u, { theta, r, iris }) {
  const depth = float(1).div(r).min(80).toVar();
  const toGrid = u.scanCells.div(TAU);
  const ahead = log(depth.div(u.scanDepth)).toVar();

  const gv = log(depth).mul(toGrid).toVar();
  const row = floor(gv);
  const tearOn = step(float(1).sub(u.scanGlitch.mul(0.3)), hash(row.add(u.scanTick.mul(7.13)).add(u.scanSeed)));
  const tear = tearOn.mul(hash(row.mul(3.1).add(u.scanTick)).sub(0.5)).mul(6);
  const gu = theta.add(depth.mul(u.twist)).add(u.spin).mul(toGrid).add(tear);

  const grid = vec2(gu, gv);
  const cell = floor(grid);
  const data = getLookup().sample(cell.add(0.5).add(u.scanSeed).div(32)).level(0).toVar();
  const local = fract(grid).sub(0.5).abs().toVar();
  const radius = max(local.x, local.y);
  const aa = fwidth(gv).mul(max(1, u.twist.mul(depth))).clamp(0.0001, 0.04).toVar();
  const resolved = float(1).sub(smoothstep(0.15, 0.45, aa.mul(10)));

  const gridLines = stroke(float(0.5).sub(local.x), aa).max(stroke(float(0.5).sub(local.y), aa));
  const box = stroke(radius.sub(0.3).abs(), aa);
  const cross = stroke(local.x, aa).mul(float(1).sub(smoothstep(0.08, 0.12, local.y)))
    .max(stroke(local.y, aa).mul(float(1).sub(smoothstep(0.08, 0.12, local.x))));
  const flicker = hash(cell.x.add(cell.y.mul(57.3)).add(u.scanTick.mul(0.618)));
  const block = step(float(1).sub(u.scanGlitch.mul(0.1)), flicker)
    .mul(float(1).sub(smoothstep(0.3, 0.3 + 0.02, radius)));

  const ink = gridLines.mul(0.14)
    .add(box.mul(step(float(1).sub(u.scanMarkers.mul(0.32)), data.r)).mul(0.65))
    .add(cross.mul(step(float(1).sub(u.scanMarkers.mul(0.17)), data.g)).mul(0.85))
    .add(block.mul(0.4))
    .add(tearOn.mul(0.08))
    .clamp(0, 1)
    .mul(resolved);

  // Markers trail behind the front; the front itself is a dashed ring
  const trail = exp(ahead.max(0).div(u.scanTrail.max(0.01)).negate()).mul(smoothstep(-0.03, 0, ahead));
  const ring = float(1).sub(smoothstep(0, aa.mul(1.5).add(0.015), ahead.abs().mul(toGrid)))
    .mul(step(0.3, fract(gu.mul(0.25))));

  const approach = exp(u.scanDepth.mul(u.fogDensity).negate()).mul(0.75).add(0.25);
  const glow = ink.mul(trail).add(ring.mul(0.8))
    .mul(u.scanStrength)
    .mul(u.scanIntensity)
    .mul(approach)
    .mul(smoothstep(0.02, 0.08, r))
    .mul(iris);
  return vec3(u.scanColor).mul(glow);
}
