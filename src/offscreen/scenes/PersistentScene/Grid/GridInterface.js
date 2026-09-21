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
  uint,
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
  floor,
  mod,
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

// Four ticks pointing at the center with a gap — a targeting reticle, not a plus.
const sdCrosshair = (p, inner, outer, th) => {
  const mid = inner.add(outer).mul(0.5);
  const half = outer.sub(inner).mul(0.5);
  const h = max(abs(p.y).sub(th), abs(abs(p.x).sub(mid)).sub(half));
  const v = max(abs(p.x).sub(th), abs(abs(p.y).sub(mid)).sub(half));
  return min(h, v);
};

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

  const u = options.uniforms ?? {
    alpha: uniform(options.alpha ?? 1.0),
    density: uniform(options.density ?? 0.22),
    quadScale: uniform(options.quadScale ?? 1.0),
    tileSize: uniform(options.tileSize ?? 1.0),
    zLift: uniform(options.zLift ?? 0.13),
    ringSpeed: uniform(options.ringSpeed ?? 0.2),
    ringAlpha: uniform(options.ringAlpha ?? 1.0),
    bracketAlpha: uniform(options.bracketAlpha ?? 0.06),
    idleBracket: uniform(options.idleBracket ?? 0.4),
    crossAlpha: uniform(options.crossAlpha ?? 0.6),
    plusAlpha: uniform(options.plusAlpha ?? 0.85),
    color: uniform(new THREE.Color(options.color ?? 0xffffff)),
    activeColor: uniform(new THREE.Color(options.activeColor ?? 0xffffff)),
    whooshInterval: uniform(options.whooshInterval ?? 5),
    whooshSpeed: uniform(options.whooshSpeed ?? 0.45),
    whooshWidth: uniform(options.whooshWidth ?? 0.18),
    whooshSmooth: uniform(options.whooshSmooth ?? 0.7),
    whooshAlpha: uniform(options.whooshAlpha ?? 1),
    whooshFlicker: uniform(options.whooshFlicker ?? 1),
    whooshFlickerSpeed: uniform(options.whooshFlickerSpeed ?? 18),
    cols: uniform(options.cols ?? 1),
    rows: uniform(options.rows ?? 1),
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
  const influence = instanceInfluence.x.toVarying("v_ifaceInfluence");
  const hovered = instanceInfluence.y.toVarying("v_ifaceHovered");
  const active = instanceInfluence.z.toVarying("v_ifaceActive");
  const underPointer = instanceInfluence.w.toVarying("v_ifacePointer");
  const rand = hash(instanceIndex).toVarying("v_ifaceRand");
  const mask = hash(instanceIndex.add(uint(71))).toVarying("v_ifaceMask");
  const idxf = float(instanceIndex);
  const gridCol = mod(idxf, u.cols).toVarying("v_ifaceCol");
  const gridRow = floor(idxf.div(u.cols)).toVarying("v_ifaceRow");

  material.colorNode = Fn(() => {
    const p = uv().sub(0.5);
    const q = abs(p);
    const soft = float(0.012);

    // Influence is 0..2 (cosine falloff); hover/pointer are already damped.
    const vis = clamp(
      max(influence.mul(0.5), max(hovered, underPointer)),
      0.0,
      1.0
    );

    const bracketC = float(0.42).add(hovered.mul(0.05));
    const bracket = fill(
      sdBracket(q, bracketC, float(0.16), float(0.014)),
      soft
    );
    const idlePulse = sin(time.mul(0.65).add(rand.mul(PI2)))
      .mul(0.5)
      .add(0.5);
    const isIdle = step(float(1.0).sub(u.density), mask).mul(
      float(1.0).sub(active)
    );
    const idleA = isIdle.mul(idlePulse).mul(u.idleBracket);

    const duration = float(1.0).div(max(u.whooshSpeed, float(0.05)));
    const period = u.whooshInterval.add(duration);
    const cycleT = fract(time.div(max(period, float(0.001)))).mul(period);
    const wipeT = cycleT.div(duration);
    const halfW = max(u.whooshWidth.mul(0.5), float(0.001));
    const fade = max(halfW.mul(u.whooshSmooth), float(0.001));
    const nx = gridCol.div(max(u.cols.sub(1.0), float(1.0)));
    const ny = gridRow.div(max(u.rows.sub(1.0), float(1.0)));
    const diag = nx.add(float(1.0).sub(ny)).mul(0.5);
    const whoosh = float(1.0)
      .sub(smoothstep(halfW.sub(fade), halfW.add(fade), abs(diag.sub(wipeT))))
      .mul(u.whooshAlpha)
      .mul(float(1.0).sub(isIdle));

    const bracketA = bracket.mul(
      max(
        u.bracketAlpha
          .add(vis.mul(0.5))
          .add(hovered.mul(0.35))
          .mul(max(active, max(vis, idleA))),
        whoosh
      )
    );

    const flicker = sin(time.mul(1.4).add(rand.mul(PI2))).mul(0.25).add(0.75);

    const strobeA = step(
      0.45,
      fract(time.mul(u.whooshFlickerSpeed).add(rand.mul(6.1)))
    );
    const strobeB = step(
      0.3,
      fract(time.mul(u.whooshFlickerSpeed.mul(1.7)).add(rand.mul(11.9)))
    );
    const plusFlick = mix(float(1.0), strobeA.mul(strobeB), u.whooshFlicker);
    const plus = fill(sdCross(p, float(0.07), float(0.014)), soft);
    const plusA = plus.mul(
      max(active.mul(u.plusAlpha), whoosh.mul(plusFlick))
    );

    // Cursor reticle: every tile, faded by mouse influence (pushed tiles too).
    const reticle = fill(
      sdCrosshair(p, float(0.1), float(0.4), float(0.008)),
      soft
    );
    const reticleA = reticle
      .mul(u.crossAlpha)
      .mul(max(active, vis))
      .mul(flicker);

    // Expanding ping: project tiles only (old WallOverlay pulse)
    const t = fract(time.mul(u.ringSpeed).add(rand));
    const tc = t.mul(t).mul(t);
    const ringSd = sdRoundBox(p, vec2(tc.mul(0.5)), float(0.04));
    const ring = stroke(ringSd, float(0.006), soft);
    const ringA = ring
      .mul(step(0.5, tc))
      .mul(clamp(float(1.0).sub(tc), 0.0, 1.0))
      .mul(u.ringAlpha)
      .mul(active);

    const hoverSd = sdRoundBox(
      p,
      vec2(float(0.34).add(hovered.mul(0.08))),
      float(0.06)
    );
    const hoverA = stroke(hoverSd, float(0.008), soft).mul(hovered);

    const outline = stroke(
      sdRoundBox(p, vec2(0.36), float(0.05)),
      float(0.007),
      soft
    ).mul(active.mul(0.45));

    const a = clamp(
      bracketA.add(plusA).add(reticleA).add(ringA).add(hoverA).add(outline),
      0.0,
      1.0
    );
    const hudCol = mix(vec3(u.color), vec3(u.activeColor), active);
    return vec4(hudCol, a.mul(u.alpha));
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
      zLift: options.zLift ?? tileDepth * 0.5 + 0.02,
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
