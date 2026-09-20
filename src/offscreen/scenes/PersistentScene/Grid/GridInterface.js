import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";
import {
  Fn,
  attribute,
  uniform,
  uv,
  time,
  hash,
  instanceIndex,
  positionLocal,
  float,
  vec2,
  vec3,
  vec4,
  abs,
  max,
  min,
  length,
  clamp,
  mix,
  fract,
  smoothstep,
  step,
  sin,
  PI2,
} from "three/tsl";
import { rotateByQuat } from "./GridCompute.js";

// ---------------------------------------------------------------------------
// 2D SDF helpers (uv space centered at 0, half extents ~0.5)
// ---------------------------------------------------------------------------

const sdRoundBox = (p, b, r) => {
  const q = abs(p).sub(b).add(r);
  return min(max(q.x, q.y), 0.0).add(length(max(q, 0.0))).sub(r);
};

// Corner bracket: an L of two bars hugging the corner at |x|=|y|=c.
// Expects q = abs(p) so one SDF covers all four corners.
const sdBracket = (q, c, len, th) => {
  const half = len.mul(0.5);
  const along = c.sub(half);
  const v = max(abs(q.x.sub(c)).sub(th), abs(q.y.sub(along)).sub(half));
  const h = max(abs(q.y.sub(c)).sub(th), abs(q.x.sub(along)).sub(half));
  return min(v, h);
};

const sdCross = (p, len, th) =>
  min(
    max(abs(p.x).sub(th), abs(p.y).sub(len)),
    max(abs(p.y).sub(th), abs(p.x).sub(len))
  );

const fill = (sd, soft) => float(1.0).sub(smoothstep(0.0, soft, sd));
const stroke = (sd, width, soft) =>
  float(1.0).sub(smoothstep(0.0, soft, abs(sd).sub(width)));

/**
 * TSL material drawing an animated SDF HUD on a unit quad per grid cell.
 * Vertex stage mirrors the tile transform exactly (same storage buffers:
 * offset + scale, quaternion, influence), so the interface sticks to the
 * front face of each tile while the compute shader animates it.
 */
export function createInterfaceMaterial(options = {}) {
  const material = new NodeMaterial();
  material.name = "GridInterface";
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;

  const u = {
    alpha: uniform(options.alpha ?? 1.0),
    // Quad size relative to the tile face
    quadScale: uniform(options.quadScale ?? 1.0),
    tileSize: uniform(options.tileSize ?? 1.0),
    // Sits just above the tile front face
    zLift: uniform(options.zLift ?? 0.13),
    // Old WallOverlay ping: cubicIn(fract(t * speed + rand)) expanding ring
    ringSpeed: uniform(options.ringSpeed ?? 0.2),
    idleRing: uniform(options.idleRing ?? 0.16),
    activeRing: uniform(options.activeRing ?? 1.0),
    bracketAlpha: uniform(options.bracketAlpha ?? 0.06),
    crossAlpha: uniform(options.crossAlpha ?? 0.6),
    color: uniform(new THREE.Color(options.color ?? 0xffffff)),
    activeColor: uniform(new THREE.Color(options.activeColor ?? 0xffffff)),
  };

  const instancePosition = attribute("instancePosition", "vec3");
  const instanceOffset = attribute("instanceOffset", "vec4"); // xyz offset, w scale
  const instanceRotation = attribute("instanceRotation", "vec4");
  const instanceInfluence = attribute("instanceInfluence", "vec4");

  // Follow the tile: same scale, rotation, and offset as GridTile
  const size = u.tileSize.mul(u.quadScale).mul(instanceOffset.w);
  const localPos = vec3(positionLocal.xy.mul(size), u.zLift.mul(instanceOffset.w));
  material.positionNode = rotateByQuat(localPos, instanceRotation)
    .add(instancePosition)
    .add(instanceOffset.xyz);

  // Per-instance state to the fragment stage
  const influence = clamp(instanceInfluence.x, 0.0, 1.0).toVarying(
    "v_ifaceInfluence"
  );
  const hovered = instanceInfluence.y.toVarying("v_ifaceHovered");
  const active = instanceInfluence.z.toVarying("v_ifaceActive");
  const rand = hash(instanceIndex).toVarying("v_ifaceRand");

  material.colorNode = Fn(() => {
    const p = uv().sub(0.5);
    const q = abs(p);
    const soft = float(0.012);

    // Corner brackets: barely-there at rest, wake up near the mouse,
    // always framed on active (project) tiles; pop outward on hover
    const bracketC = float(0.42).add(hovered.mul(0.05));
    const bracket = fill(
      sdBracket(q, bracketC, float(0.16), float(0.014)),
      soft
    );
    const bracketA = bracket.mul(
      u.bracketAlpha.add(influence.mul(0.5)).add(active.mul(0.35))
    );

    // Center crosshair with a slow per-tile flicker
    const flicker = sin(time.mul(1.4).add(rand.mul(PI2))).mul(0.25).add(0.75);
    const cross = fill(sdCross(p, float(0.07), float(0.009)), soft);
    const crossA = cross
      .mul(u.crossAlpha)
      .mul(influence.mul(0.8).add(active.mul(0.4)))
      .mul(flicker);

    // Expanding ping ring (port of the old WallOverlay rounded-rect pulse):
    // appears mid-cycle, expands outward, fades as it grows
    const t = fract(time.mul(u.ringSpeed).add(rand));
    const tc = t.mul(t).mul(t);
    const ringSd = sdRoundBox(p, vec2(tc.mul(0.5)), float(0.04));
    const ring = stroke(ringSd, float(0.006), soft);
    const ringA = ring
      .mul(step(0.5, tc))
      .mul(clamp(float(1.0).sub(tc), 0.0, 1.0))
      .mul(mix(u.idleRing, u.activeRing, active));

    // Hovered tile: solid rounded-rect outline that scales in with the pop
    const hoverSd = sdRoundBox(
      p,
      vec2(float(0.34).add(hovered.mul(0.08))),
      float(0.06)
    );
    const hoverA = stroke(hoverSd, float(0.008), soft).mul(hovered);

    const a = clamp(bracketA.add(crossA).add(ringA).add(hoverA), 0.0, 1.0);
    const col = mix(vec3(u.color), vec3(u.activeColor), active);
    return vec4(col, a.mul(u.alpha));
  })();

  material.uniforms = u;
  return material;
}

/**
 * GridInterface - one instanced quad per grid cell drawing an animated SDF
 * HUD on the tile face. A single draw call for the whole grid; all per-tile
 * animation state comes from the shared GridCompute storage buffers, so it
 * costs no extra compute and follows tiles perfectly.
 */
export class GridInterface extends THREE.InstancedMesh {
  /**
   * @param {Object} config
   * @param {number} config.count - Grid instance count
   * @param {number} config.tileSize - Tile size in world units
   * @param {number} config.tileDepth - Tile depth in world units
   * @param {THREE.InstancedBufferAttribute} config.positionBuffer - Base grid positions
   * @param {Object} config.buffers - GridCompute storage buffers
   * @param {Object} config.options - Material options (colors, alphas, speeds)
   */
  constructor({ count, tileSize, tileDepth, positionBuffer, buffers, options = {} }) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute("instancePosition", positionBuffer);
    geometry.setAttribute("instanceOffset", buffers.instanceOffset);
    geometry.setAttribute("instanceRotation", buffers.instanceRotation);
    geometry.setAttribute("instanceInfluence", buffers.instanceInfluence);

    const material = createInterfaceMaterial({
      tileSize,
      zLift: tileDepth * 0.5 + 0.02,
      ...options,
    });

    super(geometry, material, count);

    this.name = "GridInterface";
    this.frustumCulled = false;
    this.renderOrder = 10;

    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i++) this.setMatrixAt(i, identity);
    this.instanceMatrix.needsUpdate = true;
  }

  get uniforms() {
    return this.material.uniforms;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
