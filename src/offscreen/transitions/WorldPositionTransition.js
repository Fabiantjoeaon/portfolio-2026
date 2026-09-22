import { BaseTransition } from "./BaseTransition.js";
import {
  float,
  length,
  max,
  min,
  mix,
  remap,
  remapClamp,
  select,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec3,
} from "three/tsl";
import {
  Color,
  DataTexture,
  NoColorSpace,
  RepeatWrapping,
  Vector3,
} from "three/webgpu";
import { bindDebugParams, bindParamGroup } from "@/offscreen/debug/bindDebugParams";
import { params, paramValues } from "@/offscreen/params";
import loader from "@/offscreen/loader";

const sdBox = (p, b) => {
  const d = p.abs().sub(b);
  return length(max(d, vec3(0))).add(min(max(d.x, max(d.y, d.z)), float(0)));
};

const rangeTransition = (t, x, padding) => {
  const front = remap(t, 0, 1, padding.negate(), padding.add(1));
  return remap(x, front.sub(padding), front.add(padding), 1, 0);
};

const MODE_DUAL = 0;
const MODE_BLACK_WIPE = 1;
const p = paramValues(params.Transition);

const uMode = uniform(p.mode === "black-wipe" ? MODE_BLACK_WIPE : MODE_DUAL);
const uCenter = uniform(new Vector3(0, 0, 0));
const uRadius = uniform(p.radius ?? 130);
const uRotation = uniform(p.rotation ?? 55);
const uNoiseScale = uniform(p.noiseScale ?? 0.07);
const uNoiseStrength = uniform(p.noiseStrength ?? 2.82);
const uGridScale = uniform(p.gridScale ?? 0.02);
const uGridPull = uniform(p.gridPull ?? 0.05);
const uGridDim = uniform(p.gridDim ?? 0.8);
const uRadialFalloff = uniform(p.radialFalloff ?? 1.5);
const uBoundaryWidth = uniform(p.boundaryWidth ?? 0.5);
const uRingGlow = uniform(p.ringGlow ?? 0.5);
const uTriplanarSharpness = uniform(p.triplanarSharpness ?? 20);
const uEdgeColor = uniform(new Color(p.edgeColor ?? 0x1a8a94));

const rotRad = ((p.rotation ?? 55) * Math.PI) / 180;
const uRotCos = uniform(Math.cos(rotRad));
const uRotSin = uniform(Math.sin(rotRad));

export const transitionDebug = {
  mode: p.mode ?? "dual",
  originMargin: p.originMargin ?? 2,
  pause: p.pause ?? false,
  duration: p.duration ?? 2,
  progress: p.progress ?? 0,
};

const syncMode = () => {
  uMode.value =
    transitionDebug.mode === "black-wipe" ? MODE_BLACK_WIPE : MODE_DUAL;
};

const syncRotation = () => {
  const rad = (uRotation.value * Math.PI) / 180;
  uRotCos.value = Math.cos(rad);
  uRotSin.value = Math.sin(rad);
};

const _gridOrigin = new Vector3();

function createPlaceholder(value = 128) {
  const tex = new DataTexture(new Uint8Array([value, value, value, 255]), 1, 1);
  tex.colorSpace = NoColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function prepareTransitionTexture(tex) {
  if (!tex) return tex;
  tex.colorSpace = NoColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

const placeholderNoise = createPlaceholder(128);
const placeholderGrid = createPlaceholder(255);
const noiseTexNode = texture(placeholderNoise);
const gridTexNode = texture(placeholderGrid);

const defaultTextures = {
  noise: placeholderNoise,
  grid: placeholderGrid,
};

function applyDefaultTextures() {
  const noise = loader.resources?.transitionSwirl?.asset;
  const grid = loader.resources?.transitionRadial?.asset;
  if (noise && defaultTextures.noise === placeholderNoise) {
    defaultTextures.noise = prepareTransitionTexture(noise);
    noiseTexNode.value = defaultTextures.noise;
  }
  if (grid && defaultTextures.grid === placeholderGrid) {
    defaultTextures.grid = prepareTransitionTexture(grid);
    gridTexNode.value = defaultTextures.grid;
  }
}

const UNIFORM_KEYS = {
  radius: uRadius,
  rotation: uRotation,
  edgeColor: uEdgeColor,
  ringGlow: uRingGlow,
  noiseScale: uNoiseScale,
  noiseStrength: uNoiseStrength,
  gridScale: uGridScale,
  gridPull: uGridPull,
  gridDim: uGridDim,
  radialFalloff: uRadialFalloff,
  boundaryWidth: uBoundaryWidth,
  triplanarSharpness: uTriplanarSharpness,
};

/**
 * World-position wipe. Each scene is evaluated in its own reconstructed
 * world space (never blended). Noise + grid textures are sampled
 * triplanar; both are replaceable from the debug panel.
 */
export class WorldPositionTransition extends BaseTransition {
  constructor(config = {}) {
    super(config);
    this.uCenter = uCenter;
    applyDefaultTextures();
  }

  setOriginBelowGrid(grid, margin = transitionDebug.originMargin) {
    if (!grid) return;
    grid.getWorldPosition(_gridOrigin);
    const { height } = grid.getDimensions();
    uCenter.value.set(
      _gridOrigin.x,
      _gridOrigin.y - height * 0.5 - margin,
      _gridOrigin.z,
    );
  }

  _triplanar(texNode, pos, normal) {
    const xz = texNode.sample(pos.xz);
    const xy = texNode.sample(pos.xy);
    const yz = texNode.sample(pos.yz);
    const w = normal.abs().pow(uTriplanarSharpness);
    const inv = float(1).div(w.x.add(w.y).add(w.z).max(0.0001));
    return xz
      .mul(w.y.mul(inv))
      .add(xy.mul(w.z.mul(inv)))
      .add(yz.mul(w.x.mul(inv)));
  }

  _evaluateField(worldPosition, worldNormal, t) {
    const relRaw = worldPosition.sub(uCenter);
    const dist = length(relRaw);
    const clampScale = min(float(1), uRadius.div(dist.max(0.001)));
    const rel = relRaw.mul(clampScale);
    const world = uCenter.add(rel);

    const currentRadius = t.mul(uRadius).max(0.001);
    const n = this._triplanar(
      noiseTexNode,
      world.mul(uNoiseScale),
      worldNormal,
    ).r;

    const rotated = vec3(
      rel.x.mul(uRotCos).sub(rel.z.mul(uRotSin)),
      rel.y,
      rel.x.mul(uRotSin).add(rel.z.mul(uRotCos)),
    );
    const shapeDist = sdBox(
      rotated,
      vec3(currentRadius.add(n.mul(uNoiseStrength))),
    );

    const radialInfluence = smoothstep(
      float(0),
      currentRadius.mul(uRadialFalloff),
      shapeDist,
    );
    const noisePos = world
      .mul(uGridScale)
      .add(rel.mul(radialInfluence.mul(uGridPull)));
    const grid = this._triplanar(gridTexNode, noisePos, worldNormal)
      .r.min(0.999);

    const boundary = shapeDist
      .sub(currentRadius)
      .abs()
      .div(currentRadius.mul(uBoundaryWidth))
      .clamp(0, 1)
      .oneMinus();
    const gridFinal = mix(grid.mul(uGridDim), grid, boundary);

    const innerRange = remapClamp(shapeDist, 0, uRadius, 0, 1);
    const ringRadius = gridFinal.mul(t.oneMinus());
    const padding = ringRadius.mul(t).max(0.0001);
    const showInside = rangeTransition(t, innerRange, padding);

    const ring = smoothstep(float(1), gridFinal, showInside).mul(
      step(gridFinal, showInside),
    );
    const insideMask = step(gridFinal, showInside);

    return { insideMask, ring, grid: gridFinal };
  }

  _composite(outsideColor, insideColor, field) {
    const insideMixed = mix(
      insideColor,
      mix(uEdgeColor, outsideColor, field.grid),
      field.ring,
    ).add(field.ring.mul(uRingGlow));
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
      mix(uEdgeColor, outside, nextField.grid),
      nextField.ring,
    ).add(nextField.ring.mul(uRingGlow));
    const outsideWithRing = mix(
      outside,
      mix(uEdgeColor, outside, prevField.grid),
      prevField.ring,
    ).add(prevField.ring.mul(uRingGlow));
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

export function bindTransitionDebug(gui, { onNextScene } = {}) {
  if (!gui || gui._transitionDebugBound) return;
  applyDefaultTextures();

  bindDebugParams(gui, [
    {
      folder: "Transition",
      name: "Next Scene",
      type: "button",
      onChange: () => onNextScene?.(),
    },
  ]);

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
      if (key === "originMargin") {
        return { object: transitionDebug, property: "originMargin" };
      }
      if (key === "pause" || key === "duration" || key === "progress") {
        return { object: transitionDebug, property: key };
      }
      if (key === "rotation") {
        return { uniform: uRotation, onChange: syncRotation };
      }
      const uniformNode = UNIFORM_KEYS[key];
      if (uniformNode) return { uniform: uniformNode };
      return null;
    },
    "Transition",
  );

  gui._transitionDebugBound = true;
}
