import { BaseTransition } from "./BaseTransition.js";
import {
  dot,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  mx_noise_float,
  remap,
  remapClamp,
  select,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import { Color, Vector3 } from "three/webgpu";

const sdBox = (p, b) => {
  const d = p.abs().sub(b);
  return length(max(d, vec3(0))).add(min(max(d.x, max(d.y, d.z)), float(0)));
};

// map(t, 0, 1, -p, 1+p) → front position; map(x, front-p, front+p, 1, 0).
const rangeTransition = (t, x, padding) => {
  const front = remap(t, 0, 1, padding.negate(), padding.add(1));
  return remap(x, front.sub(padding), front.add(padding), 1, 0);
};

/**
 * World-position transition (port of onimo's radial position wipe).
 *
 * Each pixel's world position is reconstructed from the scenes' depth
 * buffers (both scenes render with the same interpolated camera), and an
 * expanding Y-rotated sdBox from `center` reveals the next scene over the
 * previous one. The box surface is perturbed by procedural 3D noise so the
 * front never reads flat, and it carries a ring of world-space cells that
 * dissolve one by one with an edge glow.
 *
 * Everything runs inside the existing fullscreen composite — no extra
 * render passes, no texture assets (noise and dissolve cells are
 * procedural). World position / normal / depth come from the per-scene
 * `WorldSpaceNodes` bundles handed in by PostProcessingMaterial.
 */
export class WorldPositionTransition extends BaseTransition {
  constructor(config = {}) {
    super(config);

    const {
      center = [0, 0, 0],
      radius = 130, // world units the box expands to at mix = 1
      rotation = 55, // Y rotation of the box, degrees
      edgeColor = [0.1, 0.54, 0.58],
      ringGlow = 0.5,
      noiseScale = 0.05, // world frequency of the edge-breakup noise
      noiseStrength = 5, // world units the noise pushes the box surface
      gridSize = 3, // world units per dissolve cell
      gridPull = 0.05, // how much cells stream toward the front
      gridDim = 0.8, // cell dimming away from the boundary
      radialFalloff = 1.5,
      boundaryWidth = 0.5,
    } = config;

    const rotRad = (rotation * Math.PI) / 180;
    this.uCenter = uniform(new Vector3(...center));
    this.uRadius = uniform(radius);
    this.uNoiseScale = uniform(noiseScale);
    this.uNoiseStrength = uniform(noiseStrength);
    this.uGridSize = uniform(gridSize);
    this.uGridPull = uniform(gridPull);
    this.uGridDim = uniform(gridDim);
    this.uRadialFalloff = uniform(radialFalloff);
    this.uBoundaryWidth = uniform(boundaryWidth);
    this.uRingGlow = uniform(ringGlow);
    this.uEdgeColor = uniform(new Color().fromArray(edgeColor));
    this.uRotCos = uniform(Math.cos(rotRad));
    this.uRotSin = uniform(Math.sin(rotRad));
  }

  buildColorNode({ prevTex, nextTex, uvNode, mixNode, prevWorld, nextWorld }) {
    const st = uvNode ?? uv();
    const outside = texture(prevTex, st).rgb; // previous scene, consumed
    const inside = texture(nextTex, st).rgb; // next scene, revealed

    // No depth data yet (first frames) — plain crossfade fallback.
    if (!prevWorld || !nextWorld) {
      return mix(outside, inside, mixNode);
    }

    const t = float(mixNode);

    // Blend the two reconstructions with the mix: the front is anchored to
    // the previous scene's geometry early on and eases into the next
    // scene's as it takes over the frame.
    const world = mix(prevWorld.worldPosition, nextWorld.worldPosition, t);
    const worldNormal = mix(prevWorld.worldNormal, nextWorld.worldNormal, t);

    const rel = world.sub(this.uCenter);
    // Epsilon keeps the divisions below finite at t = 0.
    const currentRadius = t.mul(this.uRadius).max(0.001);

    // Procedural swirl noise perturbs the box surface.
    const n = mx_noise_float(world.mul(this.uNoiseScale)).mul(0.5).add(0.5);

    const rotated = vec3(
      rel.x.mul(this.uRotCos).sub(rel.z.mul(this.uRotSin)),
      rel.y,
      rel.x.mul(this.uRotSin).add(rel.z.mul(this.uRotCos)),
    );
    const shapeDist = sdBox(
      rotated,
      vec3(currentRadius.add(n.mul(this.uNoiseStrength))),
    );

    // Dissolve cells anchored in world space, pulled radially near the
    // boundary so they appear to stream toward the front.
    const radialInfluence = smoothstep(
      float(0),
      currentRadius.mul(this.uRadialFalloff),
      shapeDist,
    );
    const gridPos = world.add(rel.mul(radialInfluence.mul(this.uGridPull)));

    // Planar cells picked from the dominant normal axis, one hash value
    // per cell plus fine noise inside it (replaces onimo's triplanar grid
    // texture). Clamped shy of 1 — `grid` sits in smoothstep denominators.
    const nAbs = worldNormal.abs();
    const planeUV = select(
      nAbs.x.greaterThan(max(nAbs.y, nAbs.z)),
      gridPos.zy,
      select(nAbs.y.greaterThan(nAbs.z), gridPos.xz, gridPos.xy),
    );
    const cell = floor(planeUV.div(this.uGridSize));
    const cellHash = fract(
      sin(dot(cell, vec2(12.9898, 78.233))).mul(43758.5453),
    );
    const cellNoise = mx_noise_float(gridPos.mul(this.uNoiseScale).mul(6))
      .mul(0.5)
      .add(0.5);
    const gridRaw = cellHash.mul(0.75).add(cellNoise.mul(0.25)).min(0.999);

    // Full-strength cells near the boundary, slightly dimmed further out.
    const boundary = shapeDist
      .sub(currentRadius)
      .abs()
      .div(currentRadius.mul(this.uBoundaryWidth))
      .clamp(0, 1)
      .oneMinus();
    const grid = mix(gridRaw.mul(this.uGridDim), gridRaw, boundary);

    const innerRange = remapClamp(shapeDist, 0, this.uRadius, 0, 1);
    const ringRadius = grid.mul(t.oneMinus());
    const padding = ringRadius.mul(t).max(0.0001);
    const showInside = rangeTransition(t, innerRange, padding);

    const ring = smoothstep(float(1), grid, showInside).mul(
      step(grid, showInside),
    );
    const insideMask = step(grid, showInside);

    const insideMixed = mix(inside, mix(this.uEdgeColor, outside, grid), ring)
      .add(ring.mul(this.uRingGlow));
    return mix(outside, insideMixed, insideMask);
  }
}
