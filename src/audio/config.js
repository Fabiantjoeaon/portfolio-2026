/**
 * @typedef {{ steps: string[], ornaments?: string[] }} Pattern
 * @typedef {{ attack: number, decay: number, sustain: number, release: number }} Envelope
 * @typedef {{
 *   pattern: string, octave: number, register: { low: string, high: string },
 *   voices: number, volume: number, dry: number, reverbSend: number, delaySend?: number,
 *   noteLength: string, velocity: [number, number], accents: number[],
 *   density?: { sparseGrid: string, rateLow: number, rateHigh: number, ornamentEvery: number },
 *   filter: { type: string, frequency: number, Q: number },
 *   synth: { type: 'fm'|'am'|'synth', oscillator: string, modulation?: string,
 *     harmonicity?: number, modulationIndex?: number,
 *     envelope: Envelope, modulationEnvelope?: Envelope },
 * }} SceneVoice
 * @typedef {{
 *   meta: Record<string, string>,
 *   key: import('./harmony.js').Key,
 *   transport: { bpm: number, timeSignature: [number, number] },
 *   harmony: { snap: boolean, order: 'smooth'|'shuffle', seed: number, barsPerChord: number,
 *     voicing: { bassLow: string, bassHigh: string, low: string, high: string, size: number },
 *     progression: import('./harmony.js').Chord[] },
 *   quantize: { grid: string, collision: 'drop'|'push', maxPushSlots: number },
 *   master: { volume: number, limiter: number, sceneFade: number },
 *   reverb: { decay: number, preDelay: number },
 *   page: { cutoff: number, resonance: number, rampTime: number, openCutoff: number, openResonance: number },
 *   pad: { volume: number, dry: number, reverbSend: number, velocity: number,
 *     oscillator: { type: string, count: number, spread: number }, envelope: Envelope,
 *     filter: { frequency: number, Q: number }, lfo: { rate: number, min: number, max: number },
 *     detuneLfo: { rate: number, depth: number } },
 *   patterns: Record<string, Pattern>,
 *   scenes: { meadow: SceneVoice, cube: SceneVoice,
 *     ice: { floor: SceneVoice, wall: SceneVoice, panWidth: number, panAmount: number,
 *       delay: { time: string, feedback: number, filter: number } } },
 *   sfx: { volume: number, frequency: number, Q: number, jitter: number, decay: number, throttleMs: number },
 * }} MusicConfig
 */

/**
 * @template T
 * @typedef {{ [K in keyof T]?: T[K] extends Array<any> ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }} DeepPartial
 */

/** @typedef {DeepPartial<MusicConfig>} MusicOverrides */

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Objects merge recursively, arrays and primitives replace. Returns a new object. */
export function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? structuredClone(base) : structuredClone(patch);
  const out = isPlainObject(base) ? structuredClone(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key])
      ? deepMerge(out[key], value)
      : structuredClone(value);
  }
  return out;
}

/** Keys of `current` that differ from `base`, as a minimal patch. */
export function diffConfig(base, current) {
  if (!isPlainObject(base) || !isPlainObject(current))
    return JSON.stringify(base) === JSON.stringify(current) ? undefined : current;
  const out = {};
  for (const [key, value] of Object.entries(current)) {
    const diff = diffConfig(base[key], value);
    if (diff !== undefined) out[key] = diff;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * @param {MusicConfig} generated
 * @param {MusicOverrides} overrides
 * @returns {MusicConfig}
 */
export function mergeConfig(generated, overrides) {
  return deepMerge(generated, overrides ?? {});
}
