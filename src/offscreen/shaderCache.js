import {
  createShaderCache,
  createThreeWebGPUShaderCompatibility,
  installShaderCache,
} from "three-blocks/shaders";
import { threeBlocksConfig } from "three-blocks/vite/config";
import dispatcher from "@/shared/dispatcher";
import { getTier } from "@/shared/tiers";
import { getFlag, getParam } from "@/offscreen/lib/query";

export const SHADER_READY_GLOBAL = "__PORTFOLIO_SHADERS_READY__";

// Automatic keys are build-order ordinals, so a manifest is only valid for the
// exact session shape it was captured from. Any flag that changes material
// graphs or build order maps to a key that has no manifest and compiles live.
function shaderSceneKey() {
  const variant = ["skipLoader", "hidePersistentScene", "touchExperience"]
    .filter(getFlag)
    .concat(getParam("scene") === null ? [] : ["scene"]);
  return [getTier(), ...variant].join("-");
}

/**
 * Install before the first node build. Precompiled states are only consulted
 * while scenes are prepared; later builds (project galleries, debug edits)
 * depend on visitor input, so the provider is removed once compiling ends.
 */
export async function installShaders(renderer) {
  const { shaders, base, development, threeVersion } = threeBlocksConfig;
  if (!shaders.enabled) return null;
  const scene = shaderSceneKey();
  const cache = createShaderCache(scene);
  cache.enableAutomaticRegistration();
  const sceneState = shaders.scenes?.[scene];
  const state = sceneState?.state ?? shaders.state;
  const requested = getParam("tbShaders");
  const installation = await installShaderCache({
    renderer,
    scene,
    state: requested === "live"
      ? { state: "missing", reason: "Live TSL was requested for this session." }
      : {
        state,
        strict: shaders.strict,
        changedKeys: sceneState?.changed ?? shaders.changed,
        ...(shaders.built === undefined ? {} : { built: shaders.built }),
        ...(state === "fresh" && development && requested !== "precompiled"
          ? { mode: "live", reason: "Development compiles live TSL; add ?tbShaders=precompiled to hydrate." }
          : {}),
      },
    base,
    compatibility: createThreeWebGPUShaderCompatibility({ threeVersion }),
    cache,
  });

  let done = false;
  dispatcher.on("compileEnd", () => {
    if (done) return;
    done = true;
    const stats = installation.runtimeStats;
    if (stats) console.info(`[shaders] ${scene} ${installation.mode}: ${stats.injected} precompiled, ${stats.missed} missed, ${stats.live} live`);
    if (installation.mode === "precompiled") installation.dispose();
    globalThis[SHADER_READY_GLOBAL] = true;
  });
  return installation;
}
