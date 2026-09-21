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

  PersistentScene: {
    Grid: {
      cols: { value: 34, min: 4, max: 64, step: 1, name: "Columns" },
      rows: { value: 16, min: 4, max: 40, step: 1, name: "Rows" },
      tileSize: { value: 1, min: 0.2, max: 4, step: 0.01, name: "Tile Size" },
      gap: { value: 0.1, min: 0, max: 1, step: 0.005, name: "Gap" },
      cornerRadius: {
        value: 0.1,
        min: 0,
        max: 0.5,
        step: 0.005,
        name: "Corner Radius",
      },
      depth: { value: 0.2, min: 0.02, max: 1, step: 0.01, name: "Depth" },
      gridX: { value: 0, min: -20, max: 20, step: 0.05, name: "X" },
      gridY: { value: 2, min: -10, max: 20, step: 0.05, name: "Y" },
      gridZ: { value: 0, min: -20, max: 20, step: 0.05, name: "Z" },
    },
    Motion: {
      pushStrength: {
        value: 0.2,
        min: 0,
        max: 2,
        step: 0.01,
        name: "Push",
      },
      pushZ: { value: 2, min: 0, max: 8, step: 0.05, name: "Push Z" },
      hoverLift: { value: 2, min: 0, max: 8, step: 0.05, name: "Hover Lift" },
      rotationStrength: {
        value: 1.4,
        min: 0,
        max: 6,
        step: 0.05,
        name: "Tilt",
      },
      mouseSize: {
        value: 0.2,
        min: 0.02,
        max: 1,
        step: 0.01,
        name: "Mouse Radius",
      },
      idleAmplitude: {
        value: 2,
        min: 0,
        max: 2,
        step: 0.01,
        name: "Idle Drift",
      },
      idleSpeed: {
        value: 1.8,
        min: 0,
        max: 8,
        step: 0.05,
        name: "Idle Speed",
      },
    },
    Glass: {
      displacement: {
        value: 0.34,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Displacement",
      },
      chromaticAberration: {
        value: 3,
        min: 0,
        max: 1,
        step: 0.01,
        name: "RGB Split",
      },
      refractStrength: {
        value: 0.65,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Refract",
      },
      fresnelIntensity: {
        value: 0.17,
        min: 0,
        max: 2,
        step: 0.01,
        name: "Fresnel",
      },
      fresnelIdle: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Fresnel Idle",
      },
      activeTileColor: {
        value: 0x737373,
        type: "color",
        name: "Active Color",
      },
      activeTileColorAmount: {
        value: 0.45,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Active Color Amt",
      },
    },
    Interface: {
      interfaceAlpha: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Alpha",
      },
      interfaceDensity: {
        value: 0.22,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Density",
      },
      interfaceQuadScale: {
        value: 1,
        min: 0.4,
        max: 1.6,
        step: 0.01,
        name: "Scale",
      },
      interfaceZLift: {
        value: 0.02,
        min: 0,
        max: 1,
        step: 0.005,
        name: "Z Pad",
      },
      ringSpeed: {
        value: 0.2,
        min: 0,
        max: 2,
        step: 0.01,
        name: "Ring Speed",
      },
      ringAlpha: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Ring Alpha",
      },
      bracketAlpha: {
        value: 0.66,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Brackets",
      },
      idleBracket: {
        value: 0.4,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Idle Brackets",
      },
      crossAlpha: {
        value: 0,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Crosshair",
      },
      plusAlpha: {
        value: 0.85,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Center Plus",
      },
      interfaceColor: { value: 0xffffff, type: "color", name: "Color" },
    },
    Whoosh: {
      whooshInterval: {
        value: 5,
        min: 0.5,
        max: 20,
        step: 0.1,
        name: "Interval",
      },
      whooshSpeed: {
        value: 0.45,
        min: 0.05,
        max: 3,
        step: 0.05,
        name: "Speed",
      },
      whooshWidth: {
        value: 0.18,
        min: 0.02,
        max: 0.8,
        step: 0.01,
        name: "Width",
      },
      whooshSmooth: {
        value: 1.2,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Smooth",
      },
      whooshAlpha: {
        value: 0.4,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Alpha",
      },
      whooshFlicker: {
        value: 1,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Flicker",
      },
      whooshFlickerSpeed: {
        value: 18,
        min: 1,
        max: 40,
        step: 0.5,
        name: "Flicker Speed",
      },
    },
    Overlay: {
      overlayZ: {
        value: 2.4,
        min: 0,
        max: 8,
        step: 0.05,
        name: "Line Depth",
      },
      lineStartZ: {
        value: 0.02,
        min: 0,
        max: 1,
        step: 0.005,
        name: "Line Start Pad",
      },
      labelSize: {
        value: 0.5,
        min: 0.1,
        max: 1.5,
        step: 0.01,
        name: "Label Size",
      },
      lineAlpha: { value: 1, min: 0, max: 1, step: 0.01, name: "Line Alpha" },
      lineReveal: { value: 1, min: 0, max: 1, step: 0.01, name: "Line Reveal" },
    },
    Screen: {
      screenShader: {
        value: "noise-glow",
        options: ["noise-glow", "gradient", "plasma", "solid"],
        name: "Shader",
      },
      screenInset: {
        value: 0.85,
        min: 0.4,
        max: 0.95,
        step: 0.005,
        name: "Inset",
      },
      screenZ: { value: -1.5, min: -8, max: 0, step: 0.05, name: "Z" },
      screenIntro: { value: 0, min: 0, max: 1, step: 0.01, name: "Intro" },
      screenIntroHover: {
        value: 0,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Intro Hover",
      },
      screenGlowSpeed: {
        value: 0.1,
        min: 0,
        max: 1,
        step: 0.005,
        name: "Glow Speed",
      },
      screenGlowIntensity: {
        value: 0.25,
        min: 0,
        max: 1,
        step: 0.005,
        name: "Glow Intensity",
      },
      screenVideoBrightness: {
        value: 1.2,
        min: 0,
        max: 2,
        step: 0.05,
        name: "Video Brightness",
      },
      screenHoverDisplacement: {
        value: 0,
        min: 0,
        max: 1,
        step: 0.01,
        name: "Hover Displacement",
      },
      screenHoverIn: {
        value: 1.3,
        min: 0.1,
        max: 4,
        step: 0.05,
        name: "Hover In (s)",
      },
      screenHoverOut: {
        value: 0.8,
        min: 0.1,
        max: 4,
        step: 0.05,
        name: "Hover Out (s)",
      },
    },
    ScreenLight: {
      screenLightIntensity: {
        value: 20,
        min: 0,
        max: 10,
        step: 0.05,
        name: "Intensity",
      },
      screenLightBlur: {
        value: 10,
        min: 0,
        max: 6,
        step: 0.05,
        name: "Blur",
      },
      screenLightColor: { value: 0xffffff, type: "color", name: "Color" },
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
