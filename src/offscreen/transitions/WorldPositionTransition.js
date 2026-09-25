import { BaseTransition } from "./BaseTransition.js";
import {
  Fn,
  If,
  float,
  fwidth,
  length,
  max,
  min,
  mix,
  mx_noise_float,
  remapClamp,
  smoothstep,
  tanh,
  texture,
  texture3D,
  uniform,
  uv,
  vec3,
} from "three/tsl";
import { Color, Vector3 } from "three/webgpu";
import { bindDebugParams, bindParamGroup } from "@/offscreen/debug/bindDebugParams";
import { params, paramValues } from "@/offscreen/params";
import loader from "@/offscreen/loader";
import { createWipeTexture } from "./wipeTexture.js";
import { digitalWipeField } from "./digitalWipe.js";

const sdBox = (p, b) => {
  const d = p.abs().sub(b);
  return length(max(d, vec3(0))).add(min(max(d.x, max(d.y, d.z)), float(0)));
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
const uEdgeSoftness = uniform(p.edgeSoftness ?? 1.5);
const uEdgeColor = uniform(new Color(p.edgeColor ?? 0x1a8a94));
const uTextureAmount = uniform(p.textureAmount ?? 0.45);
const uTextureScale = uniform(p.textureScale ?? 1);
const uTextureStretch = uniform(p.textureStretch ?? 1.8);
const uTextureAngle = uniform(p.textureAngle ?? 35);
const uTextureVariation = uniform(p.textureVariation ?? 0);
const uDigitalAmount = uniform(p.digitalAmount ?? 1);
const uDigitalCellSize = uniform(p.digitalCellSize ?? 2.8);
const uDigitalInk = uniform(p.digitalInk ?? 0.7);
const uDigitalPlaneAngle = uniform(p.digitalPlaneAngle ?? 36.87);
const uDigitalDeformation = uniform(p.digitalDeformation ?? 1.4);
const uDigitalSquareSize = uniform(p.digitalSquareSize ?? 0.36);
const uDigitalBandWidth = uniform(p.digitalBandWidth ?? 0.055);
const uDigitalMarkerDensity = uniform(p.digitalMarkerDensity ?? 1);
const uDigitalScanCycles = uniform(p.digitalScanCycles ?? 14);
const digitalPlaneRad = uDigitalPlaneAngle.value * Math.PI / 180;
const uDigitalPlaneCos = uniform(Math.cos(digitalPlaneRad));
const uDigitalPlaneSin = uniform(Math.sin(digitalPlaneRad));
const uTextureCos = uniform(Math.cos(uTextureAngle.value * Math.PI / 180));
const uTextureSin = uniform(Math.sin(uTextureAngle.value * Math.PI / 180));
let fieldTexture;

function getFieldTexture() {
  if (!fieldTexture) {
    const image = loader.resources?.transitionPattern?.asset?.image;
    // The worker loader flips ImageBitmaps on decode; normalize to the same
    // orientation as TextureLoader before baking the scalar volume.
    fieldTexture = texture3D(createWipeTexture(image, typeof window === "undefined"));
  }
  return fieldTexture;
}

const syncTextureAngle = () => {
  uTextureCos.value = Math.cos(uTextureAngle.value * Math.PI / 180);
  uTextureSin.value = Math.sin(uTextureAngle.value * Math.PI / 180);
};

const syncDigitalPlaneAngle = () => {
  const rad = uDigitalPlaneAngle.value * Math.PI / 180;
  uDigitalPlaneCos.value = Math.cos(rad);
  uDigitalPlaneSin.value = Math.sin(rad);
};

async function loadTextureImage(file) {
  const image = await createImageBitmap(file);
  try {
    const node = getFieldTexture();
    const previous = node.value;
    node.value = createWipeTexture(image);
    previous.dispose();
  } finally {
    image.close();
  }
}

const rotRad = ((p.rotation ?? 55) * Math.PI) / 180;
const uRotCos = uniform(Math.cos(rotRad));
const uRotSin = uniform(Math.sin(rotRad));

export const transitionDebug = {
  mode: p.mode ?? "dual",
  originMargin: p.originMargin ?? 2,
  pause: p.pause ?? false,
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
  edgeSoftness: uEdgeSoftness,
  textureAmount: uTextureAmount,
  textureScale: uTextureScale,
  textureStretch: uTextureStretch,
  textureAngle: uTextureAngle,
  textureVariation: uTextureVariation,
  digitalAmount: uDigitalAmount,
  digitalCellSize: uDigitalCellSize,
  digitalInk: uDigitalInk,
  digitalPlaneAngle: uDigitalPlaneAngle,
  digitalDeformation: uDigitalDeformation,
  digitalSquareSize: uDigitalSquareSize,
  digitalBandWidth: uDigitalBandWidth,
  digitalMarkerDensity: uDigitalMarkerDensity,
  digitalScanCycles: uDigitalScanCycles,
};

/**
 * World-position wipe. Each scene is evaluated in its own reconstructed
 * world space (never blended). Continuous world-space squares deform the
 * organic reveal and carry its interface details. No camera-space pattern,
 * mesh normals or additional render targets.
 */
export class WorldPositionTransition extends BaseTransition {
  constructor(config = {}) {
    super(config);
    this.uCenter = uCenter;
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

  _sampleField(pos) {
    return Fn(() => {
      const position = pos.toVar();
      const result = float(0).toVar();
      // Uniform branches: either endpoint pays only for its chosen source.
      If(uTextureAmount.lessThan(1), () => {
        result.assign(mx_noise_float(position).mul(0.5).add(0.5).clamp(0, 1));
      });
      If(uTextureAmount.greaterThan(0), () => {
        const coords = vec3(
          position.x.mul(uTextureCos).sub(position.y.mul(uTextureSin)),
          position.x.mul(uTextureSin).add(position.y.mul(uTextureCos)).div(uTextureStretch),
          position.z,
        ).mul(uTextureScale.mul(0.25)).add(vec3(0.31, 0.57, 0.73).mul(uTextureVariation));
        const pattern = getFieldTexture().sample(coords).level(0).r;
        result.assign(mix(result, pattern, uTextureAmount));
      });
      return result;
    })();
  }

  _evaluateField(worldPosition, t) {
    const relRaw = worldPosition.sub(uCenter);
    const dist = length(relRaw).max(0.001);
    const compress = tanh(dist.div(uRadius)).mul(uRadius).div(dist);
    const rel = relRaw.mul(compress);
    const world = uCenter.add(rel);
    const currentRadius = t.mul(uRadius).max(0.001);
    const n = this._sampleField(world.mul(uNoiseScale));

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
    const grid = this._sampleField(noisePos).min(0.999);

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
    // Algebraically equivalent reveal threshold, without dividing by the
    // vanishing padding near the start/end or untextured parts of the field.
    const edge = t.mul(padding.mul(2).add(1))
      .sub(innerRange).sub(padding.mul(2).mul(gridFinal)).toVar();
    const ink = float(0).toVar();
    If(uDigitalAmount.greaterThan(0), () => {
      // Keep true, uncompressed world coordinates for constant-sized cells.
      // A smooth bump perturbs the original reveal; never snap or replace it.
      const digital = digitalWipeField(worldPosition, {
        cellSize: uDigitalCellSize,
        progress: t,
        planeCos: uDigitalPlaneCos,
        planeSin: uDigitalPlaneSin,
        squareSize: uDigitalSquareSize,
        markerDensity: uDigitalMarkerDensity,
        scanCycles: uDigitalScanCycles,
      });
      edge.addAssign(digital.displacement.mul(uDigitalCellSize.div(uRadius))
        .mul(uDigitalAmount).mul(uDigitalDeformation));
      ink.assign(digital.ink.mul(uDigitalInk).mul(uDigitalAmount));
    });
    // Analytic coverage at native pixel resolution, bounded at depth jumps
    // so foreground/background silhouettes cannot create wide blurry halos.
    const aa = fwidth(edge).mul(uEdgeSoftness).clamp(0.001, 0.025);
    const insideMask = t.lessThanEqual(0).select(0,
      t.greaterThanEqual(1).select(1, smoothstep(aa.negate(), aa, edge)));
    const ring = smoothstep(float(0), float(0.012), edge).oneMinus()
      .mul(insideMask).mul(t.greaterThan(0).and(t.lessThan(1)).toFloat());

    const band = float(1).sub(smoothstep(0.005, uDigitalBandWidth.max(0.006), edge.abs()))
      .mul(t.greaterThan(0).and(t.lessThan(1)).toFloat());
    return { insideMask, ring, grid: gridFinal, ink: ink.mul(band) };
  }

  _composite(outsideColor, insideColor, field) {
    const insideMixed = mix(
      insideColor,
      mix(uEdgeColor, outsideColor, field.grid),
      field.ring.mul(0.35),
    ).add(field.ring.mul(uRingGlow));
    return mix(mix(outsideColor, insideMixed, field.insideMask), uEdgeColor, field.ink);
  }

  buildColorNode({ prevTex, nextTex, uvNode, mixNode, prevWorld, nextWorld, prevColor, nextColor }) {
    const st = uvNode ?? uv();
    const outside = prevColor ?? texture(prevTex, st).rgb;
    const inside = nextColor ?? texture(nextTex, st).rgb;

    if (!prevWorld || !nextWorld) {
      return mix(outside, inside, mixNode);
    }

    return Fn(() => {
      const t = float(mixNode).clamp(0, 1);
      // Material effects and reconstructed positions are shared by branches.
      // Resolve them in their common scope before TSL caches their temporaries.
      const outColor = vec3(outside).toVar();
      const inColor = vec3(inside).toVar();
      const prevPosition = prevWorld.worldPosition.toVar();
      const nextPosition = nextWorld.worldPosition.toVar();
      const result = vec3(0).toVar();
      // Exact endpoints avoid residual rings and skip all field work at rest.
      If(t.lessThanEqual(0), () => {
        result.assign(outColor);
      }).ElseIf(t.greaterThanEqual(1), () => {
        result.assign(inColor);
      }).ElseIf(uMode.greaterThan(0.5), () => {
        const t1 = smoothstep(float(0), float(0.55), t);
        const t2 = smoothstep(float(0.45), float(1), t);
        const prevOutField = this._evaluateField(prevPosition, t1);
        const nextInField = this._evaluateField(nextPosition, t2);
        const phase1 = this._composite(outColor, vec3(0), prevOutField);
        result.assign(this._composite(phase1, inColor, nextInField));
      }).Else(() => {
        const prevField = this._evaluateField(prevPosition, t);
        const nextField = this._evaluateField(nextPosition, t);
        // Blend coverage, not positions or projection normals. The two
        // surfaces share one soft reveal and a narrow highlight.
        const field = {
          insideMask: mix(prevField.insideMask, nextField.insideMask, t),
          ring: mix(prevField.ring, nextField.ring, t),
          grid: mix(prevField.grid, nextField.grid, t),
          // Each scene's markings stay on its own world-space surface and
          // fade with that surface's coverage, not an interpolated position.
          ink: mix(prevField.ink, nextField.ink,
            mix(prevField.insideMask, nextField.insideMask, t)),
        };
        result.assign(this._composite(outColor, inColor, field));
      });
      return result;
    })();
  }
}

export function bindTransitionDebug(gui, { onNextScene } = {}) {
  if (!gui || gui._transitionDebugBound) return;

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
      if (key === "pause" || key === "progress") {
        return { object: transitionDebug, property: key };
      }
      if (key === "rotation") {
        return { uniform: uRotation, onChange: syncRotation };
      }
      if (key === "textureAngle") {
        return { uniform: uTextureAngle, onChange: syncTextureAngle };
      }
      if (key === "digitalPlaneAngle") {
        return { uniform: uDigitalPlaneAngle, onChange: syncDigitalPlaneAngle };
      }
      if (key === "textureImage") {
        return { onChange: loadTextureImage, object: transitionDebug, property: "textureImage" };
      }
      const uniformNode = UNIFORM_KEYS[key];
      if (uniformNode) return { uniform: uniformNode };
      return null;
    },
    "Transition",
  );

  gui._transitionDebugBound = true;
}
