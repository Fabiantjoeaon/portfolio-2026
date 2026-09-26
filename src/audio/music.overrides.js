/**
 * Hand-edited music settings, deep-merged over music.generated.js at runtime
 * (objects merge, arrays replace). Never overwritten by the generator; the
 * debug panel's "Save to params.js" rewrites it with the live edits.
 *
 * `key` and `harmony.{snap, order, seed, barsPerChord, voicing}` are also read
 * by `npm run audio:generate`; re-run it after changing them so the pad
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

/** @type {import('./config.js').MusicOverrides} */
export default {
  key: {
    tonic: "D#",
    mode: "phrygian",
  },
  page: {
    cutoff: 640,
    resonance: 6.9,
  },
  pad: {
    volume: -17.5,
    voice: {
      vowel: "o",
      shift: 0.66,
    },
    vibrato: {
      rate: 3.3,
    },
    chorus: {
      depth: 0.88,
    },
  },
  scenes: {
    cube: {
      pattern: "arpC",
      octave: 6,
      volume: 0,
      quantizeStrength: 0,
      filter: {
        frequency: 6850,
        Q: 6.8,
      },
      synth: {
        envelope: {
          decay: 0.22,
        },
      },
    },
    ice: {
      wall: {
        pattern: "rippleLow",
        voices: 7,
        noteLength: "32n",
        quantizeStrength: 1,
      },
    },
    meadow: {
      pattern: "arpB",
      octave: 4,
      voices: 2,
      volume: -3.5,
      quantizeStrength: 0,
      filter: {
        frequency: 11920,
      },
    },
  },
  sfx: {
    frequency: 9600,
    Q: 8.7,
    jitter: 0.82,
    decay: 0.011,
  },
};
