/**
 * Hand-edited music settings, deep-merged over music.generated.js at runtime
 * (objects merge, arrays replace). Never overwritten by the generator.
 *
 * `key` and `harmony.{snap, order, seed, barsPerChord, voicing}` are also read
 * by `npm run audio:generate`; re-run it after changing them so the pad
 * progression is re-voiced. Everything else applies live (HMR).
 *
 * Pattern tokens are chord-relative: "1" "3" "5" "7" "9" chord tones,
 * "s2" "s4" "s6" scale steps above the chord root, "^" / "_" octave up / down.
 */

/** @type {import('./config.js').MusicOverrides} */
export default {
  // key: { tonic: "D#", mode: "phrygian" },
  // harmony: { snap: false, order: "smooth", barsPerChord: 4 },
  // harmony: { progression: [{ symbol: "D#m9", root: "D#", quality: "m9", bars: 4 }] },
  // transport: { bpm: 64 },
  // quantize: { grid: "16n", collision: "drop", maxPushSlots: 2 },
  // patterns: { arpA: { steps: ["1", "5", "9", "3^", "7", "5"] } },
  // scenes: { meadow: { pattern: "arpC", octave: 5 }, cube: { synth: { envelope: { release: 0.3 } } } },
};
