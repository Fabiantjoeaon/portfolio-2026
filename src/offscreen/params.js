import { GROUND_Y } from "./managers/SceneManager.js";

/**
 * Project-wide look / feel knobs. After tweaking in `?debug`, copy the
 * numbers back into `value` here.
 *
 * Nested objects become Inspector folders. A leaf is `{ value, ... }`:
 *   - `min` / `max` / `type` / `options` → shown in the GUI
 *   - `value` only → init default, edit in this file
 *   - `debug: false` hides a leaf that would otherwise show
 */
export const params = {
  CubeScene: {
    Scene: {
      background: { value: 0x121214, type: "color", name: "Background" },
    },
    Camera: {
      fov: { value: 34, min: 12, max: 90, step: 0.5, name: "FOV" },
      position: { value: [0, 7, 60] },
      lookAt: { value: [0, 0, 0] },
    },
    Glow: {
      glowColor: { value: 0xff8800, type: "color", name: "Color" },
      glowMin: { value: 0, min: 0, max: 12, step: 0.05, name: "Spill Min" },
      glowMax: { value: 3.35, min: 0, max: 12, step: 0.05, name: "Spill Max" },
      glowContrast: {
        value: 1.4,
        min: 0.2,
        max: 4,
        step: 0.05,
        name: "Contrast",
      },
      glowNoiseScale: {
        value: 0.15,
        min: 0.001,
        max: 0.5,
        step: 0.001,
        name: "Noise Scale",
      },
      glowNoiseSpeed: {
        value: 0.075,
        min: 0,
        max: 1,
        step: 0.005,
        name: "Noise Speed",
      },
      shellGlowMin: {
        value: 0,
        min: 0,
        max: 8,
        step: 0.05,
        name: "Shell Min",
      },
      shellGlowMax: {
        value: 1.15,
        min: 0,
        max: 8,
        step: 0.05,
        name: "Shell Max",
      },
    },
    Lighting: {
      hemiSky: { value: 0xffffff, type: "color", name: "Sky" },
      hemiGround: { value: 0xff8800, type: "color", name: "Ground" },
      hemiIntensity: {
        value: 0.35,
        min: 0,
        max: 5,
        step: 0.05,
        name: "Intensity",
      },
      rimStart: { value: 1, min: 0, max: 1, step: 0.01, name: "Rim Start" },
      rimStrength: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Rim Strength",
      },
      sideGlowPower: {
        value: 2.6,
        min: 0.2,
        max: 6,
        step: 0.05,
        name: "Spill Falloff",
      },
    },
    Color: {
      colorMin: { value: 0x202020, type: "color", name: "Min" },
      colorMax: { value: 0x202020, type: "color", name: "Max" },
    },
    Shape: {
      roundRadiusMin: {
        value: 0,
        min: 0,
        max: 5,
        step: 0.01,
        name: "Round Min",
      },
      roundRadiusMax: {
        value: 5,
        min: 0,
        max: 5,
        step: 0.01,
        name: "Round Max",
      },
      faceBulge: {
        value: 0.6,
        min: 0,
        max: 0.6,
        step: 0.005,
        name: "Face Bulge",
      },
      depthMin: { value: 0.61, min: 0, max: 4, step: 0.01, name: "Depth Min" },
      depthMax: { value: 3.64, min: 0, max: 4, step: 0.01, name: "Depth Max" },
    },
    Gaps: {
      gapMin: { value: 0, min: 0, max: 0.8, step: 0.005, name: "Min" },
      gapMax: { value: 0.19, min: 0, max: 0.8, step: 0.005, name: "Max" },
    },
    Layout: {
      floorY: { value: GROUND_Y },
      ceilY: { value: 25 },
      backZ: { value: -44 },
      frontZ: { value: 105 },
      width: { value: 110 },
      targetCellSize: { value: 10 },
      subdivisions: { value: 4 },
      roundSegments: { value: 16 },
      shellPad: { value: 0 },
    },
    SSAO: {
      aoRadius: { value: 4 },
      aoIntensity: { value: 10.5 },
      aoQuality: { value: "Low" },
    },
  },

  IceScene: {
    Camera: {
      fov: { value: 35 },
      position: { value: [0, 7, 60] },
      lookAt: { value: [0, 0, 0] },
    },
    Scene: {
      fogColor: { value: 0x272b30 },
      fogNear: { value: 60 },
      fogFar: { value: 200 },
      environmentIntensity: { value: 1.05 },
      ambientColor: { value: 0xcdd6de },
      ambientIntensity: { value: 0.1 },
    },
    Ground: {
      uvScale: { value: 30 },
      parallaxScale: { value: 0.5 },
      colorIntensity: { value: 1.4 },
      reflectionStrength: { value: 1 },
      normalScale: { value: 2.2 },
    },
  },
};

export function isParamLeaf(node) {
  return Boolean(node) && typeof node === "object" && "value" in node;
}

export function isDebugParam(node) {
  if (!isParamLeaf(node) || node.debug === false) return false;
  if (node.debug === true) return true;
  return node.type != null || node.min != null || node.options != null;
}

export function paramValues(group) {
  const out = {};
  if (!group) return out;
  for (const [key, node] of Object.entries(group)) {
    if (isParamLeaf(node)) out[key] = node.value;
    else if (node && typeof node === "object")
      Object.assign(out, paramValues(node));
  }
  return out;
}
