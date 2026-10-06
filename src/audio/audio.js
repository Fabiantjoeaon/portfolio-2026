import dispatcher from "@/shared/dispatcher";

/**
 * Semantic audio events per scene. The engine decides the musical response.
 * @typedef {{
 *   meadow: { type: 'flowerSpawn', intensity: number },
 *   cube: { type: 'cubeHover', id: number, intensity: number },
 *   ice: { type: 'surfaceClick', surface: 'wall' | 'floor' | 'both', position: { x: number, y: number, z: number } },
 *   ui: { type: 'tileHover' | 'transition' | 'projectHover' | 'projectNext' },
 * }} AudioEventMap
 * @typedef {'meadow' | 'cube' | 'ice' | 'project' | 'about'} AudioSceneName
 * @typedef {{ kind: 'trigger', scene: keyof AudioEventMap, event: AudioEventMap[keyof AudioEventMap], count: number }
 *   | { kind: 'mute', muted: boolean }} AudioMessage
 */

export const AUDIO_EVENT = "audio";
/** Separate event so `dispatcher.data` keeps the latest scene for a late-starting engine. */
export const AUDIO_SCENE_EVENT = "audioScene";
/** Part of the current scene's page, e.g. "end" near a project's next link. */
export const AUDIO_ZONE_EVENT = "audioZone";

// Scene code may run in the worker; the engine lives on the main thread. The
// dispatcher bridge forwards every event, so collapse bursts before they cross.
const COALESCE_MS = 16;
const pending = new Map();

function send(message) {
  dispatcher.trigger({ name: AUDIO_EVENT }, message);
}

export const audio = {
  /**
   * @template {keyof AudioEventMap} S
   * @param {S} scene
   * @param {AudioEventMap[S]} event
   */
  trigger(scene, event) {
    const key = `${scene}:${event.type}`;
    const now = performance.now();
    let state = pending.get(key);
    if (!state) pending.set(key, (state = { last: -Infinity, suppressed: 0 }));
    if (now - state.last < COALESCE_MS) {
      state.suppressed++;
      return;
    }
    state.last = now;
    const count = 1 + state.suppressed;
    state.suppressed = 0;
    send({ kind: "trigger", scene, event, count });
  },

  /** @param {AudioSceneName} scene */
  setScene(scene) {
    dispatcher.trigger({ name: AUDIO_SCENE_EVENT }, { scene });
  },

  /** @param {string | null} zone */
  setZone(zone) {
    dispatcher.trigger({ name: AUDIO_ZONE_EVENT }, { zone });
  },

  /** @param {boolean} muted */
  setMuted(muted) {
    send({ kind: "mute", muted });
  },
};
