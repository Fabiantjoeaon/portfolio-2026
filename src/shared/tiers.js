import { getParam } from "@/offscreen/lib/query.js";
import { isMobileOrTablet } from "@/shared/devices";
import { benchmarkGPU } from "@/shared/gpuBenchmark";

/**
 * Device quality tiers: the one place to decide what each class of device
 * renders. Force a tier with `?tier=low|medium|high`.
 *
 * Rows are settings, columns are tiers. A missing column keeps the params.js
 * value, so `high` normally stays empty and params.js remains the source of
 * truth for the full-quality look. EFFECTS keys are dotted params.js paths.
 */
export const TIER_NAMES = ["low", "medium", "high"];

export const RENDER = {
  // Device pixel ratio per tier, never above MAX_DPR.
  // dpr: { low: 1.5, medium: 1.5, high: 2 },
  dpr: { low: 2, medium: 2, high: 2 },
  // Lowest DPR adaptive resolution steps down to while frames miss the refresh.
  minDpr: { low: 1.5, medium: 1.5, high: 1.5 },
  // Offscreen scene MSAA. WebGPU only supports 4 or 0 (off).
  msaa: { low: 4, medium: 4, high: 4 },

  // Gbuffer resolution of the scene coming in during a wipe. 1 is off. It
  // returns to full resolution from incomingScaleFrom (wipe mix) on; 1 keeps
  // it reduced until the wipe ends. Scenes with a global postprocessingChain
  // always stay full. None of these wipe rows apply to Project / About wipes.
  incomingScale: { low: 1, medium: 1, high: 1 },
  incomingScaleFrom: { low: 1, medium: 1, high: 1 },
  // Gbuffer resolution of the scene going out, from outgoingScaleFrom (wipe
  // mix) on. 1 is off.
  outgoingScale: { low: 0.25, medium: 0.25, high: 0.25 },
  outgoingScaleFrom: { low: 0.25, medium: 0.25, high: 0.25 },

  // Wipe mix span [start, end] for the scene coming in: its reflections start
  // at `start`, its volumetric fog fades in by `end`. null is off.
  incomingExtras: { low: [0, 0.5], medium: [0, 0.5], high: [0, 0.5] },
  // Same for the scene going out: reflections stop at `start`, fog fades out
  // by `end`. null is off.
  outgoingExtras: { low: [0, 1], medium: [0, 1], high: [0, 1] },
};

export const EFFECTS = {
  // FXAA drops MSAA on every gbuffer and the output target for one pass
  "Rendering.antialias": { low: "fxaa", medium: "fxaa", high: "msaa" },

  // Lit wipe front (depth-reconstructed normals)
  "Transition.Lighting.lightingEnabled": { low: false },

  // // Screen light shafts
  "PersistentScene.ScreenShafts.shaftsEnabled": { low: false, medium: false },

  // // Volumetric fog ray march
  //"MeadowScene.Fog.fogEnabled": { low: false },
  //"IceScene.Fog.fogEnabled": { low: false },

  // "PersistentScene.ScreenShafts.shaftResolution": {},

  // // Glass tiles
  // "PersistentScene.Glass.enhancedGlassEnabled": {},
  // "PersistentScene.Glass.innerRefractEnabled": { low: false },
  // // Dispersion samples the transmission backdrop three times instead of once
  // "PersistentScene.Glass.chromaticAberration": { low: 0 },

  // // Meadow
  // "MeadowScene.Reflections.reflectionResolution": { low: 0.5, medium: 0.5 },
  // "MeadowScene.Reflections.reflectionInterval": { low: 3 },
  // "MeadowScene.Tracking.trackingWallCount": { low: 6 },

  // // Cube

  // "CubeScene.Particles.glyphCount": { low: 80, medium: 140 },

  // "CubeScene.Shafts.shaftSteps": { medium: 20 },
  // "CubeScene.Shafts.shaftResolution": { medium: 0.35 },

  // // Ice
  // "IceScene.Ground.reflectionResolution": { low: 0.25, medium: 0.35 },
  // "IceScene.Trail.trailEnabled": {},
  // "IceScene.Cave.caveRockCount": {},

  // TODO: Anti aliasing?
};

const PHONE = /iPhone|iPod|Android.*Mobile|Mobile.*Firefox/i;

// Minimum benchmarkGPU() GFLOPS per tier. The benchmark ends before Apple GPUs
// reach full clocks, so scores sit below steady state. Measured on an M3 Max
// (30-core): Chrome ~4400, Safari ~6000, ~7700 fully warm. A base M1, at
// ~1/4 of its throughput, should land around 1100-1500.
const GPU_SCORE = { medium: 1000, high: 3500 };
const SCORE_CACHE = "gpuScore:v4";
// Intel's discrete Arc architectures; every other Intel GPU shares system
// memory and runs out of bandwidth long before the ALU benchmark shows it.
const INTEL_DISCRETE = /hpg|12hp/;

async function gpuScore(adapter) {
  const key = `${adapter.info.vendor}|${adapter.info.architecture}|${navigator.userAgent}`;
  try {
    const cached = JSON.parse(localStorage.getItem(SCORE_CACHE));
    if (cached?.key === key) return cached.score;
  } catch {}

  const score = await benchmarkGPU();
  if (score !== null) {
    try {
      localStorage.setItem(SCORE_CACHE, JSON.stringify({ key, score }));
    } catch {}
  }
  return score;
}

/**
 * Main thread only: classify this device. The result is forwarded to the
 * worker through the query string.
 * @returns {Promise<{ tier: "low"|"medium"|"high", gpuScore: number|null }>}
 */
export async function detectTier() {
  const forced = getParam("tier");
  if (TIER_NAMES.includes(forced)) return { tier: forced, gpuScore: null };

  let level = 2;
  if (PHONE.test(navigator.userAgent)) level = 0;
  else if (isMobileOrTablet()) level = 1;

  const adapter = await navigator.gpu
    ?.requestAdapter({ powerPreference: "high-performance" })
    .catch(() => null);
  const info = adapter?.info;
  let score = null;
  if (!adapter || info?.isFallbackAdapter) level = 0;
  else if (level > 0) {
    score = await gpuScore(adapter);
    if (score !== null) {
      const measured =
        score >= GPU_SCORE.high ? 2 : score >= GPU_SCORE.medium ? 1 : 0;
      level = Math.min(level, measured);
    }
    if (/intel/i.test(info?.vendor ?? "") && !INTEL_DISCRETE.test(info?.architecture ?? "")) {
      level = Math.min(level, 1);
    }
  }

  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = navigator.deviceMemory ?? 8;
  if (cores <= 4 || memory <= 4) level -= 1;

  return { tier: TIER_NAMES[Math.max(0, level)], gpuScore: score };
}

let active = null;

export function setTier(name) {
  active = name;
}

export function getTier() {
  if (!active) {
    const param = getParam("tier");
    active = TIER_NAMES.includes(param) ? param : "high";
  }
  return active;
}

export function renderSetting(key) {
  return RENDER[key][getTier()];
}

/** Write this tier's EFFECTS into params. Run before any scene module loads. */
export function applyTierParams(params) {
  const tier = getTier();
  for (const [path, row] of Object.entries(EFFECTS)) {
    const leaf = path.split(".").reduce((node, key) => node?.[key], params);
    if (!leaf || !("value" in leaf)) {
      console.warn(`[tiers] "${path}" is not a params.js leaf`);
      continue;
    }
    if (tier in row) leaf.value = row[tier];
  }
}
