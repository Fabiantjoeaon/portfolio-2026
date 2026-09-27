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
    tonic: "F#",
    mode: "minor",
  },
  harmony: {
    progression: [{
      symbol: "Dmaj7",
      root: "D",
      quality: "maj7",
      degree: "VI",
      bars: 0.5,
      notes: ["A2", "D3"],
    }, {
      symbol: "E7",
      root: "E",
      quality: "7",
      degree: "VII",
      bars: 0.75,
      notes: ["B2", "E3"],
    }, {
      symbol: "F#m7",
      root: "F#",
      quality: "m7",
      degree: "i",
      bars: 0.5,
      notes: ["C#3", "F#3"],
    }, {
      symbol: "E7",
      root: "E",
      quality: "7",
      degree: "VII",
      bars: 0.625,
      notes: ["B2", "E3"],
    }, {
      symbol: "C#m7",
      root: "C#",
      quality: "m7",
      degree: "v",
      bars: 1.625,
      notes: ["G#2", "C#3"],
    }, {
      symbol: "Dmaj7",
      root: "D",
      quality: "maj7",
      degree: "VI",
      bars: 0.5,
      notes: ["C#3", "D3"],
    }, {
      symbol: "E7",
      root: "E",
      quality: "7",
      degree: "VII",
      bars: 0.75,
      notes: ["B2", "E3"],
    }, {
      symbol: "F#m7",
      root: "F#",
      quality: "m7",
      degree: "i",
      bars: 0.5,
      notes: ["C#3", "F#3"],
    }, {
      symbol: "E7",
      root: "E",
      quality: "7",
      degree: "VII",
      bars: 0.625,
      notes: ["B2", "E3"],
    }, {
      symbol: "C#m7",
      root: "C#",
      quality: "m7",
      degree: "v",
      bars: 1.625,
      notes: ["G#2", "C#3"],
    }],
  },
  page: {
    cutoff: 640,
    resonance: 6.9,
    rampTime: 2.6,
  },
  pad: {
    volume: -17.5,
    envelope: {
      attack: 0.05,
      release: 10.8,
    },
    voice: {
      vowel: "o",
      shift: 0.66,
      width: 0.95,
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
      pattern: "arpA",
      octave: 3,
      volume: 0,
      quantizeStrength: 0,
      filter: {
        frequency: 6670,
        Q: 6.8,
      },
      synth: {
        envelope: {
          decay: 0.22,
          attack: 0.008,
        },
        type: "fm",
        harmonicity: 9.6,
        oscillator: "fatsquare",
        modulation: "fatsawtooth",
        modulationEnvelope: {
          decay: 0.43,
          release: 0.77,
        },
        modulationIndex: 30,
      },
      voices: 8,
      delaySend: 0.26,
      delay: {
        time: 0.44,
      },
      noteLength: "32n",
      density: {
        rateHigh: 6.2,
        ornamentEvery: 4,
      },
    },
    ice: {
      wall: {
        pattern: "rippleLow",
        voices: 3,
        noteLength: "32n",
        quantizeStrength: 1,
        octave: 4,
        volume: 0,
        synth: {
          harmonicity: 2.34,
          modulationIndex: 40,
          oscillator: "fatsine",
          modulation: "fatsquare",
          envelope: {
            decay: 1.38,
          },
          modulationEnvelope: {
            attack: 0.001,
          },
        },
      },
      floor: {
        delaySend: 0.35,
        filter: {
          frequency: 2560,
        },
        synth: {
          oscillator: "fatsine",
          modulation: "fatsquare",
          modulationEnvelope: {
            release: 0.87,
          },
        },
      },
    },
    meadow: {
      pattern: "arpA",
      octave: 7,
      voices: 8,
      volume: -8.5,
      quantizeStrength: 0,
      filter: {
        frequency: 3280,
        Q: 0.1,
      },
      reverbSend: 0.62,
      delaySend: 0.09,
      delay: {
        time: 0.22,
        feedback: 0.3,
      },
      noteLength: "32n",
      velocity: [0.92, 0.85],
      density: {
        rateLow: 3.7,
        ornamentEvery: 0,
      },
      synth: {
        type: "synth",
        harmonicity: 14.35,
        modulationIndex: 27.8,
        oscillator: "fatsquare",
        envelope: {
          decay: 0.2,
          sustain: 0.05,
          release: 0.56,
        },
        modulationEnvelope: {
          attack: 0.001,
          decay: 2.85,
        },
      },
    },
  },
  sfx: {
    frequency: 9600,
    Q: 8.7,
    jitter: 0.82,
    decay: 0.008,
  },
};
