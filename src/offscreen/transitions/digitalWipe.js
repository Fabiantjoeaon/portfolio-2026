import { DataTexture, NearestFilter, RepeatWrapping, RGBAFormat } from "three/webgpu";
import { float, floor, fract, fwidth, smoothstep, step, texture, vec2 } from "three/tsl";

let lookup;

// Four independent cell attributes, baked once (4 KiB). This is a lookup,
// not an image projected onto geometry: no normals, seams or triplanar blend.
function getLookup() {
  if (lookup) return lookup;
  const data = new Uint8Array(32 * 32 * 4);
  let seed = 0x721f9a;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    data[i] = seed >>> 24;
  }
  const map = new DataTexture(data, 32, 32, RGBAFormat);
  map.name = "Digital wipe cell lookup";
  map.minFilter = map.magFilter = NearestFilter;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  lookup = texture(map);
  return lookup;
}

/** A rotatable orthonormal world-space plane, extruded through the volume.
 * Its vertical axis tilts through Y/Z so both ground and walls carry detail.
 * No camera coordinates, depth normals or competing projection weights.
 * The same continuous square profile drives the reveal and its markings.
 */
export function digitalWipeField(worldPosition, controls) {
  const grid = vec2(
    worldPosition.x,
    worldPosition.y.mul(controls.planeCos).add(worldPosition.z.mul(controls.planeSin)),
  ).div(controls.cellSize.max(0.1)).toVar();
  const cell = floor(grid);
  const data = getLookup().sample(cell.add(0.5).div(32)).level(0).toVar();
  const local = fract(grid).sub(0.5).abs().toVar();
  const footprint = fwidth(grid).max(0.0001).toVar();
  const aa = footprint.clamp(0.0001, 0.04);
  const resolved = float(1).sub(smoothstep(0.15, 0.45, footprint.x.max(footprint.y)));
  const radius = local.x.max(local.y).toVar();
  // Both value and slope reach zero at cell borders. Random cell values can
  // change there without cutting the organic field or producing a seam.
  const envelope = float(1).sub(smoothstep(controls.squareSize.mul(0.75), 0.5, radius));
  const displacement = envelope.mul(data.r.sub(0.5)).mul(resolved);
  const stroke = (distance, width) => float(1).sub(smoothstep(float(0.006).sub(width).max(0), float(0.006).add(width), distance));
  const box = stroke(radius.sub(controls.squareSize).abs(), aa.x.max(aa.y));
  const gridLines = stroke(float(0.5).sub(local.x), aa.x)
    .max(stroke(float(0.5).sub(local.y), aa.y));
  const cross = stroke(local.x, aa.x).mul(float(1).sub(smoothstep(0.08, 0.12, local.y)))
    .max(stroke(local.y, aa.y).mul(float(1).sub(smoothstep(0.08, 0.12, local.x))));
  const scan = fract(controls.progress.mul(controls.scanCycles).add(data.b)).toVar();
  const pulse = smoothstep(0, 0.08, scan).mul(float(1).sub(smoothstep(0.35, 0.55, scan)));
  const dash = stroke(local.y.sub(0.29).abs(), aa.y.mul(1.5))
    .mul(step(local.x, data.a.mul(0.27).add(0.05)));
  const boxThreshold = float(1).sub(controls.markerDensity.mul(0.32));
  const crossThreshold = float(1).sub(controls.markerDensity.mul(0.17));
  const dashThreshold = float(1).sub(controls.markerDensity.mul(0.42));
  const ink = gridLines.mul(0.1)
    .add(box.mul(step(boxThreshold, data.r)).mul(0.65))
    .add(cross.mul(step(crossThreshold, data.g)).mul(0.85))
    .add(dash.mul(step(dashThreshold, data.g)).mul(pulse))
    .clamp(0, 1).mul(resolved);
  return { displacement, ink };
}
