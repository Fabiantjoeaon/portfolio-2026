/**
 * Hand-edited music settings, deep-merged over music.generated.js and
 * src/audio/song.js at runtime (objects merge, arrays replace). Never
 * overwritten by the generator; the debug panel's "Save to params.js" rewrites
 * it with the live edits.
 *
 * Notes come from the MIDI files in public/audio/midi/ (see song.js); the
 * generated `harmony` and `patterns` are no longer played.
 *
 * Examples:
 *   transport: { bpm: 131 },
 *   quantize: { grid: "16n", collision: "drop", maxPushSlots: 1 },
 *   arp: { volume: -10, synth: { envelope: { decay: 0.3 } } },
 *   scenes: { meadow: { follow: { mode: "echo", phrase: "up" }, quantizeStrength: 0 } },
 */

/** @type {import('../../config.js').MusicOverrides} */
export default {
  pad: {
    volume: -13,
    velocity: 0.83,
    voice: {
      vowel: "i",
      shift: 1.5,
      width: 2.95,
      volume: -5,
    },
    vibrato: {
      rate: 7,
    },
  },
  scenes: {
    meadow: {
      noteLength: "32n",
      filter: {
        frequency: 15240,
      },
      volume: -5,
      delaySend: 0.23,
      quantizeStrength: 0,
    },
    cube: {
      register: {
        low: "A4",
      },
      volume: 0,
      noteLength: "32n",
      filter: {
        frequency: 6350,
        Q: 9.9,
      },
      synth: {
        oscillator: "fatsquare",
      },
    },
  },
  sfx: {
    frequency: 7840,
    Q: 11.3,
    noise: "brown",
    filter: "highpass",
    sustain: 0.59,
    release: 0.029,
    volume: -15,
    attack: 0.007,
  },
  arp: {
    homeLevel: 1.05,
    volume: -1.5,
    delaySend: 0.26,
    delay: {
      time: "8n",
    },
    filter: {
      frequency: 20000,
      Q: 8.7,
    },
    synth: {
      envelope: {
        decay: 0.2,
        release: 0.52,
      },
    },
  },
  bass: {
    volume: -40,
  },
  follow: {
    window: "16n",
  },
  quantize: {
    grid: "32n",
    collision: "drop",
    maxPushSlots: 4,
  },
  loops: {
    drums: {
      volume: -13.5,
    },
  },
};
