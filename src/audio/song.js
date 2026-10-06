/**
 * The song: tempo, key, MIDI parts and samples. Merged over the active
 * reference's music.generated.js and under its music.overrides.js.
 *
 * Paths are relative to public/. Replace a part by dropping a new .mid in
 * public/audio/midi/ (any length, rounded up to whole bars and looped).
 * Loops in public/audio/samples/loops/ follow the transport: declare the tempo
 * and bar count they were recorded at, and build them with
 * `npm run audio:loops -- <stem export dir>`. `transport.sampleOffset` (ms)
 * delays (+) or advances (-) all loops against the MIDI parts. A loop's
 * `scenes` may name a zone of a page too: "project:end" is the project page
 * scrolled to its next-project glow. `lfo` swells a loop's gain between `min`
 * and `max` once every `bars`. `pitchDrift` (cents) detunes every one-shot
 * play or scene note by a random amount up to ± that much. One-shots in
 * public/audio/samples/oneshots/ are optional; missing files are skipped.
 *
 * Interactive layers (meadow, cube, ice) only play pitch classes the arp plays
 * within `follow.window` of the note, snapped to `key`. `follow.mode`:
 *   "pool": `phrase` steps index the pool upwards from the register's low note
 *   "echo": `phrase` steps offset from the arp's current note
 */

/** @type {import('./config.js').MusicOverrides} */
export default {
  transport: { bpm: 122, timeSignature: [4, 4], sampleOffset: 0 },
  key: { tonic: "D#", mode: "aeolian" },

  midi: {
    arp: "audio/midi/arp.mid",
  },

  loops: {
    main: {
      url: "audio/samples/loops/main.mp3",
      bpm: 122,
      bars: 32,
      scenes: ["meadow", "cube", "ice", "about", "project"],
      volume: -6,
      reverbSend: 0,
      fadeIn: 2,
      fadeOut: 2,
    },
    bells: {
      url: "audio/samples/loops/bells.mp3",
      bpm: 122,
      bars: 32,
      scenes: ["meadow", "cube", "ice"],
      volume: -6,
      reverbSend: 0,
      fadeIn: 2,
      fadeOut: 3,
      lfo: { bars: 8, min: 0, max: 1 },
    },
    supp: {
      url: "audio/samples/loops/supp.mp3",
      bpm: 122,
      bars: 32,
      scenes: ["about", "project:end"],
      volume: -6,
      reverbSend: 0,
      fadeIn: 2,
      fadeOut: 3,
    },
    drums: {
      url: "audio/samples/loops/drums.mp3",
      bpm: 122,
      bars: 32,
      scenes: ["about"],
      volume: -6,
      reverbSend: 0,
      fadeIn: 1.5,
      fadeOut: 2,
    },
  },

  oneShots: {
    transition: { url: "audio/samples/oneshots/transition.mp3", volume: -8, throttleMs: 300, pitchDrift: 40 },
    projectHover: { url: "audio/samples/oneshots/project-hover.mp3", volume: -12, throttleMs: 120, pitchDrift: 40 },
    projectNext: { url: "audio/samples/oneshots/project-next.mp3", volume: -8, throttleMs: 300 },
  },

  pad: {
    velocity: 0.75,
    voice: { bypass: false },
  },

  arp: {
    homeLevel: 0,
    pageLevel: 1,
    volume: -12,
    dry: 0.8,
    reverbSend: 0.35,
    delaySend: 0.2,
    delay: { time: "8n.", feedback: 0.25, filter: 3000 },
    octave: 0,
    velocity: 0.8,
    gate: 1,
    voices: 4,
    filter: { type: "lowpass", frequency: 3200, Q: 0.7 },
    synth: {
      type: "fm",
      oscillator: "sine",
      modulation: "sine",
      harmonicity: 2,
      modulationIndex: 2.5,
      envelope: { attack: 0.003, decay: 0.18, sustain: 0.05, release: 0.25 },
      modulationEnvelope: { attack: 0.002, decay: 0.1, sustain: 0, release: 0.2 },
    },
  },

  follow: {
    window: "4n",
    phrases: {
      unison: [0],
      up: [0, 1, 2, 3],
      wave: [0, 2, 1, 3, 2, 4],
      fall: [4, 2, 3, 1, 2, 0],
      answer: [1, -1, 2, 0],
    },
  },

  scenes: {
    meadow: { follow: { mode: "pool", phrase: "wave" } },
    cube: { follow: { mode: "echo", phrase: "answer" } },
    ice: { wall: { follow: { mode: "pool", phrase: "fall" }, pitchDrift: 15 } },
  },

  /** Merged last on phones and tablets. */
  mobile: {
    reverb: { decay: 4 },
    pad: { oscillator: { count: 1 }, voice: { bypass: true } },
    arp: { voices: 2 },
    scenes: { meadow: { voices: 2 }, cube: { voices: 2 }, ice: { wall: { voices: 2 } } },
  },
};
