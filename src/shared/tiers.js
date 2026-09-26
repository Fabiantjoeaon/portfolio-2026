import { getParam } from "@/offscreen/lib/query.js";
import { isMobileOrTablet } from "@/shared/devices";

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
  // Max device pixel ratio.
  dpr: { low: 1, medium: 1.5, high: 2 },
  // Offscreen scene MSAA. WebGPU only supports 4 or 0 (off).
  msaa: { low: 4, medium: 4, high: 4 },
};

export const EFFECTS = {
  // Screen light shafts
  "PersistentScene.ScreenShafts.shaftsEnabled": { low: false },
  "PersistentScene.ScreenShafts.shaftSteps": { medium: 12 },
  "PersistentScene.ScreenShafts.shaftResolution": {},

  // Glass tiles
  "PersistentScene.Glass.enhancedGlassEnabled": {},
  "PersistentScene.Glass.innerRefractEnabled": { low: false },

  // Meadow
  "MeadowScene.Reflections.reflectionResolution": { low: 0.25, medium: 0.35 },
  "MeadowScene.Reflections.reflectionInterval": { low: 3 },
  "MeadowScene.Tracking.trackingWallCount": { low: 6 },

  // Cube
  "CubeScene.SSAO.aoQuality": { low: "Performance" },
  "CubeScene.Particles.glyphCount": { low: 80, medium: 140 },

  // Ice
  "IceScene.Ground.reflectionResolution": { low: 0.25, medium: 0.35 },
  "IceScene.Trail.trailEnabled": {},
  "IceScene.Cave.caveRockCount": {},
};

const PHONE = /iPhone|iPod|Android.*Mobile|Mobile.*Firefox/i;

/**
 * Main thread only: classify this device. The result is forwarded to the
 * worker through the query string.
 * @returns {Promise<"low"|"medium"|"high">}
 */
export async function detectTier() {
  const forced = getParam("tier");
  if (TIER_NAMES.includes(forced)) return forced;

  let level = 2;
  if (PHONE.test(navigator.userAgent)) level = 0;
  else if (isMobileOrTablet()) level = 1;

  const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
  const info = adapter?.info;
  if (!adapter || info?.isFallbackAdapter) level = 0;
  else if (/intel/i.test(info?.vendor ?? "")) level = Math.min(level, 1);

  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = navigator.deviceMemory ?? 8;
  if (cores <= 4 || memory <= 4) level -= 1;

  return TIER_NAMES[Math.max(0, level)];
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
