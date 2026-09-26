/**
 * @typedef {{ steps: string[], ornaments?: string[] }} Pattern
 * @typedef {{ attack: number, decay: number, sustain: number, release: number }} Envelope
 * @typedef {{
 *   pattern: string, octave: number, register: { low: string, high: string },
 *   voices: number, volume: number, dry: number, reverbSend: number, delaySend?: number,
 *   noteLength: string, velocity: [number, number], accents: number[],
 *   quantizeStrength: number,
 *   density?: { rateLow: number, rateHigh: number, ornamentEvery: number },
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
 *     detuneLfo: { rate: number, depth: number },
 *     voice: { vowel: 'a'|'e'|'i'|'o'|'u', shift: number, width: number, mix: number, gain: number },
 *     vibrato: { rate: number, depth: number },
 *     chorus: { rate: number, depth: number, wet: number } },
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

/** Rewrites `target` in place to equal `source`, keeping nested object identities. */
export function assignDeep(target, source) {
  for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) assignDeep(target[key], value);
    else target[key] = structuredClone(value);
  }
  return target;
}

export function countLeaves(value) {
  if (!isPlainObject(value)) return 1;
  return Object.values(value).reduce((sum, child) => sum + countLeaves(child), 0);
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function literal(value, indent) {
  if (typeof value === "number") return String(Number(value.toFixed(4)));
  if (Array.isArray(value)) return `[${value.map((item) => literal(item, indent)).join(", ")}]`;
  if (!isPlainObject(value)) return JSON.stringify(value);
  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  const pad = "  ".repeat(indent + 1);
  const lines = entries.map(([key, child]) =>
    `${pad}${IDENTIFIER.test(key) ? key : JSON.stringify(key)}: ${literal(child, indent + 1)},`);
  return `{\n${lines.join("\n")}\n${"  ".repeat(indent)}}`;
}

const OVERRIDES_HEADER = `/**
 * Hand-edited music settings, deep-merged over music.generated.js at runtime
 * (objects merge, arrays replace). Never overwritten by the generator; the
 * debug panel's "Save to params.js" rewrites it with the live edits.
 *
 * \`key\` and \`harmony.{snap, order, seed, barsPerChord, voicing}\` are also read
 * by \`npm run audio:generate\`; re-run it after changing them so the pad
 * progression is re-voiced. Everything else applies live (HMR).
 *
 * Pattern tokens are chord-relative: "1" "3" "5" "7" "9" chord tones,
 * "s2" "s4" "s6" scale steps above the chord root, "^" / "_" octave up / down.
 *
 * Examples:
 *   harmony: { snap: false, order: "smooth", barsPerChord: 4 },
 *   harmony: { progression: [{ symbol: "D#m9", root: "D#", quality: "m9", bars: 4 }] },
 *   transport: { bpm: 64 },
 *   quantize: { grid: "16n", collision: "drop", maxPushSlots: 1 },
 *   patterns: { arpA: { steps: ["1", "5", "9", "3^", "7", "5"] } },
 *   scenes: { meadow: { pattern: "arpC", quantizeStrength: 0 } },
 */
`;

/** @param {MusicOverrides} overrides */
export function renderOverrides(overrides) {
  return `${OVERRIDES_HEADER}\n/** @type {import('./config.js').MusicOverrides} */\nexport default ${literal(overrides, 0)};\n`;
}
