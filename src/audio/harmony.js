/**
 * Pure harmony helpers shared by the audio engine, the generator
 * (scripts/audio/generate.mjs) and the node tests. No Tone, no Vite aliases.
 *
 * Pattern tokens are chord-relative and resolved at play time:
 *   "1" "3" "5" "7" "9" "11" "13"  chord tones of the current chord
 *   "s2" "s4" "s6" ...              scale steps above the chord root, taken
 *                                   from the chord's own scale
 *   "^" / "_" suffixes              one octave up / down each
 */

/**
 * @typedef {{ tonic: string, mode: string }} Key
 * @typedef {{
 *   symbol: string, root: string, quality: string, bars: number,
 *   notes?: string[], degree?: string, borrowed?: boolean
 * }} Chord
 * @typedef {{ octave: number, low: string|number, high: string|number }} Register
 */

export const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = { Db: 1, Eb: 3, Fb: 4, Gb: 6, Ab: 8, Bb: 10, Cb: 11, "E#": 5, "B#": 0 };

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

/** Chord qualities as intervals above the root (9th = 14, b9 = 13). */
export const QUALITIES = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  mmaj7: [0, 3, 7, 11],
  9: [0, 4, 7, 10, 14],
  "7b9": [0, 4, 7, 10, 13],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  m7b9: [0, 3, 7, 10, 13],
  m7b5b9: [0, 3, 6, 10, 13],
  m9b5: [0, 3, 6, 10, 14],
  m11: [0, 3, 7, 10, 14, 17],
};

const mod12 = (value) => ((value % 12) + 12) % 12;

/** @param {string} name - "D#", "Eb", "d#" */
export function pcOf(name) {
  const clean = name.trim();
  const letter = clean[0].toUpperCase() + clean.slice(1);
  if (letter in FLATS) return FLATS[letter];
  const index = PITCH_CLASSES.indexOf(letter);
  if (index < 0) throw new Error(`Unknown pitch class "${name}"`);
  return index;
}

/** @param {string|number} note - "D#3" (C4 = 60) or a MIDI number */
export function noteToMidi(note) {
  if (typeof note === "number") return note;
  const match = /^([A-Ga-g][#b]?)(-?\d+)$/.exec(note.trim());
  if (!match) throw new Error(`Unknown note "${note}"`);
  return (Number(match[2]) + 1) * 12 + pcOf(match[1]);
}

export function midiToNote(midi) {
  return `${PITCH_CLASSES[mod12(midi)]}${Math.floor(midi / 12) - 1}`;
}

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** @param {string} mode */
export function normalizeMode(mode) {
  const key = String(mode).toLowerCase().replace(/\(.*\)/, "").trim();
  if (key === "minor" || key === "natural minor") return "aeolian";
  if (key === "major") return "ionian";
  if (!(key in MODES)) throw new Error(`Unknown mode "${mode}"`);
  return key;
}

/** @param {Key} key */
export function scalePcs(key) {
  const tonic = pcOf(key.tonic);
  return MODES[normalizeMode(key.mode)].map((step) => mod12(tonic + step));
}

/** @param {string} symbol - "D#m9", "Emaj9", "Bbm7b5" */
export function parseChord(symbol) {
  const match = /^([A-G][#b]?)(.*)$/.exec(symbol.trim());
  if (!match || !(match[2] in QUALITIES)) return null;
  return { symbol: symbol.trim(), root: match[1], quality: match[2], intervals: QUALITIES[match[2]] };
}

export function chordIntervals(chord) {
  return QUALITIES[chord.quality] ?? chord.intervals ?? QUALITIES.m;
}

export function chordPcs(chord) {
  const root = pcOf(chord.root);
  return chordIntervals(chord).map((interval) => mod12(root + interval));
}

/** Core tones (root, 3rd, 5th, 7th) all inside the scale; extensions are color. */
export function chordFits(chord, scale) {
  const root = pcOf(chord.root);
  return chordIntervals(chord)
    .filter((interval) => interval < 12)
    .every((interval) => scale.includes(mod12(root + interval)));
}

/** @param {Array<{root: string, quality: string}>} chords @param {Key} key */
export function keyFit(chords, key) {
  const scale = scalePcs(key);
  let fits = 0;
  let extensions = 0;
  for (const chord of chords) {
    if (chordFits(chord, scale)) fits++;
    const root = pcOf(chord.root);
    const ext = chordIntervals(chord).filter((interval) => interval >= 12);
    if (ext.length) extensions += ext.filter((i) => scale.includes(mod12(root + i))).length / ext.length;
  }
  return { fits, total: chords.length, extensions };
}

/**
 * Rank every tonic x mode by chord fit, then by evidence from the analysis.
 * @param {Array<{root: string, quality: string}>} chords
 * @param {{ pcStrength?: Record<string, number>, keyCandidates?: string[], modes?: string[] }} evidence
 */
export function rankKeys(chords, { pcStrength = {}, keyCandidates = [], modes = Object.keys(MODES) } = {}) {
  const candidateTonics = keyCandidates.map((name) => pcOf(name.split(/\s+/)[0]));
  const ranked = [];
  for (const tonic of PITCH_CLASSES) {
    for (const mode of modes) {
      const key = { tonic, mode: normalizeMode(mode) };
      const fit = keyFit(chords, key);
      const tonicPc = pcOf(tonic);
      const candidateRank = candidateTonics.indexOf(tonicPc);
      const tonicChord = chords.some((chord) => pcOf(chord.root) === tonicPc && chordFits(chord, scalePcs(key)));
      const score = fit.fits * 10 + fit.extensions
        + (candidateRank >= 0 ? 3 - candidateRank : 0)
        + (pcStrength[tonic] ?? 0) * 2
        + (tonicChord ? 2 : 0);
      ranked.push({ key, ...fit, score });
    }
  }
  return ranked.sort((a, b) => b.score - a.score);
}

const MODE_FAMILIES = {
  minor: ["dorian", "aeolian", "phrygian"],
  major: ["ionian", "lydian"],
  dominant: ["mixolydian"],
  halfDiminished: ["locrian"],
  suspended: ["mixolydian", "dorian"],
};

function chordFamily(intervals) {
  const set = new Set(intervals.map(mod12));
  if (set.has(3) && set.has(6)) return "halfDiminished";
  if (set.has(3)) return "minor";
  if (set.has(4) && set.has(10)) return "dominant";
  if (set.has(4)) return "major";
  return "suspended";
}

// Interval (mod 12) -> scale step index 0..6 above the chord root
const STEP_OF = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

const chordScaleCache = new Map();

/**
 * Seven intervals above the chord root: the family mode that shares the most
 * notes with the key, with the chord's own tones substituted in. Passing
 * tones therefore stay consonant over borrowed chords.
 * @param {{root: string, quality: string}} chord @param {Key} key
 */
export function chordScale(chord, key) {
  const cacheKey = `${chord.root}${chord.quality}|${key.tonic}${key.mode}`;
  const cached = chordScaleCache.get(cacheKey);
  if (cached) return cached;
  const root = pcOf(chord.root);
  const intervals = chordIntervals(chord);
  const keyScale = scalePcs(key);
  let best = null;
  let bestShared = -1;
  for (const mode of MODE_FAMILIES[chordFamily(intervals)]) {
    const shared = MODES[mode].filter((step) => keyScale.includes(mod12(root + step))).length;
    if (shared > bestShared) {
      bestShared = shared;
      best = MODES[mode];
    }
  }
  const scale = best.slice();
  for (const interval of intervals) scale[STEP_OF[mod12(interval)]] = mod12(interval);
  chordScaleCache.set(cacheKey, scale);
  return scale;
}

const TOKEN = /^s?(\d+)([\^_]*)$/;

/** Semitones above the chord root for a pattern token. */
export function tokenInterval(token, chord, key) {
  const match = TOKEN.exec(token);
  if (!match) throw new Error(`Bad pattern token "${token}"`);
  const degree = Math.max(1, Number(match[1]));
  const step = (degree - 1) % 7;
  const octaves = Math.floor((degree - 1) / 7);
  let shift = 0;
  for (const char of match[2]) shift += char === "^" ? 12 : -12;
  return chordScale(chord, key)[step] + octaves * 12 + shift;
}

/** Fold `midi` by octaves into [low, high]. */
export function fold(midi, low, high) {
  let value = midi;
  while (value < low) value += 12;
  while (value > high && value - 12 >= low) value -= 12;
  return value;
}

/**
 * @param {string} token @param {{root: string, quality: string}} chord
 * @param {Key} key @param {Register} register
 */
export function resolveToken(token, chord, key, register) {
  const base = (register.octave + 1) * 12 + pcOf(chord.root);
  return fold(
    base + tokenInterval(token, chord, key),
    noteToMidi(register.low),
    noteToMidi(register.high),
  );
}

export function loopBars(progression) {
  return progression.reduce((sum, chord) => sum + chord.bars, 0);
}

/**
 * Chord playing at a Transport tick position (wrapped over the loop).
 * @param {Chord[]} progression
 */
export function chordAtTick(progression, ticks, ppq, beatsPerBar = 4) {
  const barTicks = ppq * beatsPerBar;
  const loopTicks = loopBars(progression) * barTicks;
  let t = ((ticks % loopTicks) + loopTicks) % loopTicks;
  for (let i = 0; i < progression.length; i++) {
    const length = progression[i].bars * barTicks;
    if (t < length) return i;
    t -= length;
  }
  return progression.length - 1;
}

const UPPER_PRIORITY = [3, 4, 10, 11, 14, 13, 7, 6, 17, 2, 5, 9];

/**
 * Voice a chord as bass root + (size - 1) upper tones, choosing octaves that
 * move least from `prev`; no minor seconds between upper voices.
 * @returns {number[]} MIDI notes, bass first, ascending
 */
export function voiceChord(chord, prev = null, {
  bassLow = 36, bassHigh = 47, low = 50, high = 74, size = 4, center = 61,
} = {}) {
  const root = pcOf(chord.root);
  let bass = bassLow + mod12(root - bassLow);
  if (bass > bassHigh) bass -= 12;
  const intervals = chordIntervals(chord);
  const upper = UPPER_PRIORITY.filter((i) => intervals.includes(i)).slice(0, size - 1);
  if (upper.length < size - 1 && intervals.includes(7) && !upper.includes(7)) upper.push(7);
  const options = upper.map((interval) => {
    const out = [];
    for (let midi = low; midi <= high; midi++) if (mod12(midi) === mod12(root + interval)) out.push(midi);
    return out;
  });
  const prevUpper = prev ? prev.slice(1).sort((a, b) => a - b) : null;
  let best = null;
  let bestCost = Infinity;
  const pick = new Array(upper.length);
  const search = (index, strict) => {
    if (index === upper.length) {
      const sorted = pick.slice().sort((a, b) => a - b);
      if (strict) {
        for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] < 2) return;
        if (sorted[sorted.length - 1] - sorted[0] > 19) return;
      }
      let cost = 0;
      if (prevUpper && prevUpper.length === sorted.length) {
        for (let i = 0; i < sorted.length; i++) cost += Math.abs(sorted[i] - prevUpper[i]);
      } else {
        for (const midi of sorted) cost += Math.abs(midi - center) * 0.5;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = sorted;
      }
      return;
    }
    for (const midi of options[index]) {
      pick[index] = midi;
      search(index + 1, strict);
    }
  };
  search(0, true);
  if (!best) search(0, false);
  return [bass, ...(best ?? [])];
}

export function voiceLeadingDistance(a, b) {
  if (!a || !b) return 0;
  let cost = Math.abs(a[0] - b[0]) * 0.25;
  const n = Math.min(a.length, b.length);
  for (let i = 1; i < n; i++) cost += Math.abs(a[i] - b[i]);
  return cost;
}

/** Voice a chord sequence as a loop; cost includes the seam back to the start. */
export function voiceSequence(chords, options) {
  const voicings = [];
  let prev = null;
  let cost = 0;
  for (const chord of chords) {
    const voicing = voiceChord(chord, prev, options);
    cost += voiceLeadingDistance(prev, voicing);
    voicings.push(voicing);
    prev = voicing;
  }
  cost += voiceLeadingDistance(prev, voicings[0]);
  return { voicings, cost };
}

function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const out = [];
  items.forEach((item, index) => {
    const rest = items.slice(0, index).concat(items.slice(index + 1));
    for (const perm of permutations(rest)) out.push([item, ...perm]);
  });
  return out;
}

const sameOrder = (order, symbols) =>
  symbols.length === order.length && order.every((chord, i) => chord.symbol === symbols[i]);

/**
 * Tonic first, remaining order minimizing looped voice-leading distance.
 * `avoid` (the reference order) is skipped when any alternative exists.
 */
export function orderSmooth(chords, options, avoid = []) {
  const [first, ...rest] = chords;
  let best = null;
  for (const perm of permutations(rest.slice(0, 7))) {
    const order = [first, ...perm];
    const result = voiceSequence(order, options);
    const copied = sameOrder(order, avoid);
    const better = !best || (best.copied && !copied) || (copied === best.copied && result.cost < best.cost);
    if (better) best = { order, copied, ...result };
  }
  return best;
}

/** Mulberry32 */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tonic first, rest shuffled with `seed`, never equal to `avoid` (the reference order). */
export function orderShuffle(chords, seed, avoid = []) {
  const [first, ...rest] = chords;
  const random = seededRandom(seed);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  if (sameOrder([first, ...rest], avoid) && rest.length > 1) rest.push(rest.shift());
  return [first, ...rest];
}

function qualityFromIntervals(intervals) {
  const target = intervals.join(",");
  for (const [quality, value] of Object.entries(QUALITIES)) if (value.join(",") === target) return quality;
  return null;
}

/** Diatonic chord stacked in thirds on a scale root, up to `extent` (7 or 9). */
export function diatonicChord(rootPc, key, extent = 9) {
  const scale = scalePcs(key);
  const index = scale.indexOf(rootPc);
  const stack = extent >= 9 ? [0, 2, 4, 6, 8] : [0, 2, 4, 6];
  const intervals = stack.map((offset) => {
    const pc = scale[(index + offset) % 7];
    return mod12(pc - rootPc) + (offset >= 7 ? 12 : 0);
  });
  const quality = qualityFromIntervals(intervals)
    ?? qualityFromIntervals(intervals.slice(0, 4))
    ?? (intervals[1] === 3 ? "m7" : "maj7");
  const root = PITCH_CLASSES[rootPc];
  return { symbol: `${root}${quality}`, root, quality, intervals: QUALITIES[quality] ?? intervals };
}

/** Replace a borrowed chord with the diatonic chord on (or next to) its root. */
export function snapChord(chord, key) {
  const scale = scalePcs(key);
  if (chordFits(chord, scale)) return chord;
  const root = pcOf(chord.root);
  const target = [0, -1, 1, -2, 2].map((d) => mod12(root + d)).find((pc) => scale.includes(pc));
  return { ...chord, ...diatonicChord(target, key, chordIntervals(chord).some((i) => i >= 12) ? 9 : 7) };
}

const ROMAN = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];

export function romanDegree(chord, key) {
  const numeral = ROMAN[mod12(pcOf(chord.root) - pcOf(key.tonic))];
  return chordIntervals(chord).includes(3) ? numeral.toLowerCase() : numeral;
}
