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
import { bindParamGroup } from "@/offscreen/debug/bindDebugParams";
import { params } from "@/offscreen/params";

const sdBox = (p, b) => {
  const d = p.abs().sub(b);
  return length(max(d, vec3(0))).add(min(max(d.x, max(d.y, d.z)), float(0)));
};

// map(t, 0, 1, -p, 1+p) → front position; map(x, front-p, front+p, 1, 0).
const rangeTransition = (t, x, padding) => {
  const front = remap(t, 0, 1, padding.negate(), padding.add(1));
  return remap(x, front.sub(padding), front.add(padding), 1, 0);
};

const MODE_DUAL = 0;
const MODE_BLACK_WIPE = 1;

const uMode = uniform(
  params.Transition?.mode?.value === "black-wipe"
    ? MODE_BLACK_WIPE
    : MODE_DUAL,
);

const transitionDebug = {
  mode: params.Transition?.mode?.value ?? "dual",
};

const syncMode = () => {
  uMode.value =
    transitionDebug.mode === "black-wipe" ? MODE_BLACK_WIPE : MODE_DUAL;
};

const _gridOrigin = new Vector3();

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
 * Two live-toggleable modes share the same per-scene field:
 *   dual        — prev field consumes the old scene; next field draws the
 *                 revealed edge. Each scene is evaluated in its own world
 *                 space (never blended).
 *   black-wipe  — wipe prev out to black, then wipe next in, with a short
 *                 overlap so the black gap never reads as a hard cut.
 *
 * Sky / empty-depth pixels are clamped onto a dome of radius `uRadius` so
 * far-plane reconstructions don't stall the front. The wipe origin is
 * typically set below the persistent tile grid at transition start.
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

  /**
   * Anchor the wipe origin a few units below the persistent tile grid.
   */
  setOriginBelowGrid(grid, margin = 2) {
    if (!grid) return;
    grid.getWorldPosition(_gridOrigin);
    const { height } = grid.getDimensions();
    this.uCenter.value.set(
      _gridOrigin.x,
      _gridOrigin.y - height * 0.5 - margin,
      _gridOrigin.z,
    );
  }

  /**
   * Evaluate the wipe field in a single scene's world space.
   * Far-plane hits are rescaled onto a dome of radius `uRadius`.
   */
  _evaluateField(worldPosition, worldNormal, t) {
    const relRaw = worldPosition.sub(this.uCenter);
    const dist = length(relRaw);
    const clampScale = min(float(1), this.uRadius.div(dist.max(0.001)));
    const rel = relRaw.mul(clampScale);
    const world = this.uCenter.add(rel);

    const currentRadius = t.mul(this.uRadius).max(0.001);
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

    const radialInfluence = smoothstep(
      float(0),
      currentRadius.mul(this.uRadialFalloff),
      shapeDist,
    );
    const gridPos = world.add(rel.mul(radialInfluence.mul(this.uGridPull)));

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

    return { insideMask, ring, grid };
  }

  _composite(outsideColor, insideColor, field) {
    const insideMixed = mix(
      insideColor,
      mix(this.uEdgeColor, outsideColor, field.grid),
      field.ring,
    ).add(field.ring.mul(this.uRingGlow));
    return mix(outsideColor, insideMixed, field.insideMask);
  }

  buildColorNode({ prevTex, nextTex, uvNode, mixNode, prevWorld, nextWorld }) {
    const st = uvNode ?? uv();
    const outside = texture(prevTex, st).rgb;
    const inside = texture(nextTex, st).rgb;

    if (!prevWorld || !nextWorld) {
      return mix(outside, inside, mixNode);
    }

    const t = float(mixNode);

    const prevField = this._evaluateField(
      prevWorld.worldPosition,
      prevWorld.worldNormal,
      t,
    );
    const nextField = this._evaluateField(
      nextWorld.worldPosition,
      nextWorld.worldNormal,
      t,
    );

    const insideWithEdge = mix(
      inside,
      mix(this.uEdgeColor, outside, nextField.grid),
      nextField.ring,
    ).add(nextField.ring.mul(this.uRingGlow));
    const outsideWithRing = mix(
      outside,
      mix(this.uEdgeColor, outside, prevField.grid),
      prevField.ring,
    ).add(prevField.ring.mul(this.uRingGlow));
    const dual = mix(outsideWithRing, insideWithEdge, prevField.insideMask);

    const t1 = smoothstep(float(0), float(0.55), t);
    const t2 = smoothstep(float(0.45), float(1), t);
    const black = vec3(0, 0, 0);
    const prevOutField = this._evaluateField(
      prevWorld.worldPosition,
      prevWorld.worldNormal,
      t1,
    );
    const nextInField = this._evaluateField(
      nextWorld.worldPosition,
      nextWorld.worldNormal,
      t2,
    );
    const phase1 = this._composite(outside, black, prevOutField);
    const blackWipe = this._composite(phase1, inside, nextInField);

    return select(uMode.greaterThan(0.5), blackWipe, dual);
  }
}

export function bindTransitionDebug(gui) {
  if (!gui || gui._transitionDebugBound) return;
  gui._transitionDebugBound = true;
  bindParamGroup(
    gui,
    params.Transition,
    (key) => {
      if (key === "mode") {
        return {
          object: transitionDebug,
          property: "mode",
          onChange: syncMode,
        };
      }
      return null;
    },
    "Transition",
  );
}
