/**
 * `harmony`, `patterns`, `page` and the scene `pattern`/`octave` keys are
 * still written by the generator but no longer read by the engine.
 * @typedef {{ steps: string[], ornaments?: string[] }} Pattern
 * @typedef {{ attack: number, decay: number, sustain: number, release: number }} Envelope
 * @typedef {{ time: number|string, feedback: number, filter: number }} Delay
 * @typedef {{ type: 'fm'|'am'|'synth', oscillator: string, count?: number, spread?: number,
 *   modulation?: string, harmonicity?: number, modulationIndex?: number,
 *   detune?: number, portamento?: number,
 *   envelope: Envelope, modulationEnvelope?: Envelope }} Synth
 * @typedef {{ type: string, frequency: number, Q: number, rolloff?: number }} Filter
 * @typedef {{
 *   follow: { mode: 'pool'|'echo', phrase: string },
 *   pattern?: string, octave?: number, register: { low: string, high: string },
 *   voices: number, volume: number, dry: number, reverbSend: number, delaySend?: number,
 *   noteLength: string, velocity: [number, number], accents: number[],
 *   quantizeStrength: number,
 *   delay?: Delay,
 *   density?: { rateLow: number, rateHigh: number, ornamentEvery: number },
 *   filter: Filter,
 *   synth: Synth,
 * }} SceneVoice
 * @typedef {{
 *   volume: number, dry: number, reverbSend: number, delaySend?: number, delay?: Delay,
 *   octave: number, velocity: number, gate: number, voices: number,
 *   filter: Filter, synth: Synth,
 * }} TrackVoice
 * @typedef {{ url: string, bpm: number, bars: number, offset?: number, scenes: string[], volume: number,
 *   reverbSend: number, fadeIn: number, fadeOut: number }} LoopSample
 * @typedef {{ url: string, volume: number, throttleMs: number }} OneShotSample
 * @typedef {{
 *   meta: Record<string, string>,
 *   key: import('./harmony.js').Key,
 *   transport: { bpm: number, timeSignature: [number, number] },
 *   midi: { pad: string, arp: string },
 *   loops: Record<string, LoopSample>,
 *   oneShots: Record<string, OneShotSample>,
 *   arp: TrackVoice & { homeLevel: number, pageLevel: number },
 *   follow: { window: string, phrases: Record<string, number[]> },
 *   mobile: DeepPartial<MusicConfig>,
 *   harmony: { snap: boolean, order: 'smooth'|'shuffle', seed: number, barsPerChord: number,
 *     voicing: { bassLow: string, bassHigh: string, low: string, high: string, size: number },
 *     progression: import('./harmony.js').Chord[] },
 *   quantize: { grid: string, collision: 'drop'|'push', maxPushSlots: number },
 *   master: { volume: number, limiter: number, sceneFade: number },
 *   reverb: { decay: number, preDelay: number },
 *   pad: { volume: number, dry: number, reverbSend: number, velocity: number,
 *     oscillator: { type: string, count: number, spread: number }, envelope: Envelope,
 *     synth: Omit<Synth, 'oscillator' | 'envelope'>,
 *     filter: { type?: string, frequency: number, Q: number, rolloff?: number },
 *     lfo: { rate: number, min: number, max: number },
 *     detuneLfo: { rate: number, depth: number },
 *     voice: { bypass: boolean, vowel: 'a'|'e'|'i'|'o'|'u', shift: number, width: number, mix: number, gain: number, volume: number },
 *     vibrato: { rate: number, depth: number },
 *     chorus: { rate: number, depth: number, wet: number } },
 *   patterns: Record<string, Pattern>,
 *   scenes: { meadow: SceneVoice, cube: SceneVoice,
 *     ice: { floor: SceneVoice, wall: SceneVoice, panWidth: number, panAmount: number, delay: Delay } },
 *   sfx: { volume: number, frequency: number, Q: number, jitter: number, decay: number, throttleMs: number,
 *     noise: string, filter: string, attack: number, sustain: number, release: number },
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
 * @param {MusicOverrides} song
 * @param {MusicOverrides} overrides
 * @param {boolean} mobile - merges `mobile` last
 * @returns {MusicConfig}
 */
export function mergeConfig(generated, song, overrides, mobile = false) {
  const config = deepMerge(deepMerge(generated, song ?? {}), overrides ?? {});
  return mobile && config.mobile ? deepMerge(config, config.mobile) : config;
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
 * Hand-edited music settings, deep-merged over music.generated.js and
 * src/audio/song.js at runtime (objects merge, arrays replace). Never
 * overwritten by the generator; the debug panel's "Save to params.js" rewrites
 * it with the live edits.
 *
 * Notes come from the MIDI files in public/audio/midi/ (see song.js); the
 * generated \`harmony\` and \`patterns\` are no longer played.
 *
 * Examples:
 *   transport: { bpm: 131 },
 *   quantize: { grid: "16n", collision: "drop", maxPushSlots: 1 },
 *   arp: { volume: -10, synth: { envelope: { decay: 0.3 } } },
 *   scenes: { meadow: { follow: { mode: "echo", phrase: "up" }, quantizeStrength: 0 } },
 */
`;

/** @param {MusicOverrides} overrides */
export function renderOverrides(overrides) {
  return `${OVERRIDES_HEADER}\n/** @type {import('../../config.js').MusicOverrides} */\nexport default ${literal(overrides, 0)};\n`;
}
