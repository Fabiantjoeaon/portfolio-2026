#!/usr/bin/env node
/**
 * Reads scripts/audio/reference/{analysis.json, MUSIC_BRIEF.md} (from
 * ambient_analyze.py) and writes src/audio/music.generated.js.
 *
 * Precedence for key and harmony settings: src/audio/music.overrides.js,
 * then the brief (your by-ear corrections), then analysis.json.
 *
 * Usage: npm run audio:generate
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import {
  MODES,
  chordFits,
  diatonicChord,
  keyFit,
  midiToNote,
  normalizeMode,
  noteToMidi,
  orderShuffle,
  orderSmooth,
  parseChord,
  pcOf,
  rankKeys,
  romanDegree,
  scalePcs,
  snapChord,
  voiceSequence,
} from "../../src/audio/harmony.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const PATHS = {
  analysis: resolve(ROOT, "scripts/audio/reference/analysis.json"),
  brief: resolve(ROOT, "scripts/audio/reference/MUSIC_BRIEF.md"),
  overrides: resolve(ROOT, "src/audio/music.overrides.js"),
  output: resolve(ROOT, "src/audio/music.generated.js"),
};

const DEFAULT_BPM = 70;
const MIN_PULSE_CLARITY = 0.3;

/** Pull the fields the generator needs out of MUSIC_BRIEF.md. */
export function parseBrief(text = "") {
  const line = (label) => new RegExp(`^\\s*-\\s*${label}:\\s*(.+)$`, "im").exec(text)?.[1]?.trim() ?? null;
  const strip = (value) => value.replace(/\*\*\([^)]*\)\*\*|\([^)]*\)|\*\*/g, "").trim();

  const centerLine = line("Tonal center");
  const tonic = centerLine ? /^\**\s*([A-G][#b]?)/.exec(strip(centerLine))?.[1] ?? null : null;
  const guess = centerLine ? /best key guess\s+([A-G][#b]?)\s+(minor|major)/i.exec(centerLine) : null;

  const modeLine = line("Mode");
  const modes = modeLine
    ? Object.keys(MODES).filter((mode) => new RegExp(`\\b${mode}\\b`, "i").test(modeLine))
    : [];

  const colorsLine = line("Chord colors[^:]*");
  const chordColors = colorsLine
    ? strip(colorsLine).split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const pulseLine = line("Pulse");
  const bpmMatch = pulseLine ? /(\d+(?:\.\d+)?)\s*bpm/i.exec(pulseLine) : null;
  const beatless = pulseLine ? /no pulse|beatless|free time/i.test(pulseLine) : null;

  const reverbLine = line("Reverb / space");
  const decayMatch = reverbLine && !/TODO/.test(reverbLine)
    ? /(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*s\b/.exec(reverbLine)
    : null;

  return {
    tonic,
    keyGuess: guess ? { tonic: guess[1], mode: guess[2].toLowerCase() } : null,
    modes,
    chordColors,
    bpm: bpmMatch ? Number(bpmMatch[1]) : null,
    beatless,
    reverbDecay: decayMatch
      ? (Number(decayMatch[1]) + Number(decayMatch[2] ?? decayMatch[1])) / 2
      : null,
  };
}

function resolveBpm(analysis, brief) {
  const rhythm = analysis.rhythm ?? {};
  const beatless = brief.beatless ?? /no pulse|beatless/i.test(rhythm.pulse ?? "");
  if (brief.bpm && !beatless) return { bpm: Math.round(brief.bpm), source: "brief" };
  if (!beatless && (rhythm.pulse_clarity ?? 0) >= MIN_PULSE_CLARITY && rhythm.pulse_bpm_if_any)
    return { bpm: Math.round(rhythm.pulse_bpm_if_any), source: "analysis pulse" };
  return { bpm: DEFAULT_BPM, source: "default (no pulse)" };
}

function resolveKey(overrides, brief, analysis) {
  const tonality = analysis.tonality ?? {};
  const stated = overrides.key?.tonic ?? brief.tonic;
  if (stated) {
    let mode = overrides.key?.mode;
    const source = overrides.key?.tonic ? "overrides" : "brief";
    if (!mode && brief.modes.length === 1) mode = brief.modes[0];
    if (!mode && brief.keyGuess && pcOf(brief.keyGuess.tonic) === pcOf(stated)) mode = brief.keyGuess.mode;
    if (!mode) mode = brief.modes[0] ?? "aeolian";
    return { key: { tonic: stated, mode: normalizeMode(mode) }, source };
  }
  const [tonic, quality = "minor"] = (tonality.key_candidates?.[0]?.key ?? "A minor").split(/\s+/);
  return { key: { tonic, mode: normalizeMode(quality) }, source: "analysis" };
}

function chordColorsFrom(brief, analysis) {
  const names = brief.chordColors.length
    ? brief.chordColors
    : (analysis.harmony?.timeline ?? []).map((entry) => entry.chord);
  const seen = new Set();
  const chords = [];
  for (const name of names) {
    const chord = parseChord(name);
    if (!chord || seen.has(chord.symbol)) continue;
    seen.add(chord.symbol);
    chords.push(chord);
  }
  return chords;
}

function referenceOrder(analysis) {
  const out = [];
  for (const { chord } of analysis.harmony?.timeline ?? []) {
    if (chord === "silence" || out[out.length - 1] === chord) continue;
    if (!out.includes(chord)) out.push(chord);
  }
  return out;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function hashSeed(...parts) {
  return createHash("sha1").update(parts.join("\n")).digest().readUInt32LE(0);
}

const PATTERNS = {
  arpA: { steps: ["1", "5", "9", "3^", "5^", "3^", "9", "5"], ornaments: ["s4^", "s6"] },
  arpB: { steps: ["1", "3", "7", "5", "9", "3", "5^", "7"], ornaments: ["s2^", "s6"] },
  arpC: { steps: ["5", "1^", "3^", "9", "7", "3"], ornaments: ["s4"] },
  rippleLow: { steps: ["1", "5", "1^", "3^", "7"], ornaments: [] },
  rippleHigh: { steps: ["9", "5", "3^", "7", "1^"], ornaments: [] },
};

function sceneDefaults() {
  return {
    meadow: {
      pattern: "arpA",
      octave: 5,
      register: { low: "E5", high: "C7" },
      voices: 4,
      volume: -1,
      dry: 0.75,
      reverbSend: 0.45,
      delaySend: 0.45,
      delay: { time: 0.38, feedback: 0.4, filter: 4500 },
      noteLength: "16n",
      velocity: [0.35, 0.85],
      accents: [1, 0.5, 0.75, 0.5],
      quantizeStrength: 0.15,
      density: { rateLow: 3, rateHigh: 10, ornamentEvery: 4 },
      filter: { type: "lowpass", frequency: 5200, Q: 0.7 },
      synth: {
        type: "fm",
        harmonicity: 3,
        modulationIndex: 7,
        oscillator: "sine",
        modulation: "sine",
        envelope: { attack: 0.004, decay: 0.28, sustain: 0, release: 0.35 },
        modulationEnvelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.2 },
      },
    },
    cube: {
      pattern: "arpB",
      octave: 4,
      register: { low: "A3", high: "G5" },
      voices: 4,
      volume: -1,
      dry: 0.8,
      reverbSend: 0.3,
      delaySend: 0.4,
      delay: { time: 0.25, feedback: 0.35, filter: 3200 },
      noteLength: "16n",
      velocity: [0.3, 0.8],
      accents: [0.55, 0.35, 1, 0.45],
      quantizeStrength: 0.15,
      density: { rateLow: 2, rateHigh: 8, ornamentEvery: 5 },
      filter: { type: "lowpass", frequency: 1900, Q: 2.2 },
      synth: {
        type: "am",
        harmonicity: 2,
        oscillator: "triangle",
        modulation: "sine",
        envelope: { attack: 0.006, decay: 0.35, sustain: 0.04, release: 0.45 },
        modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.3 },
      },
    },
    ice: {
      delay: { time: 0.65, feedback: 0.45, filter: 2400 },
      panWidth: 30,
      panAmount: 0.8,
      floor: {
        pattern: "rippleLow",
        octave: 3,
        register: { low: "C3", high: "G4" },
        voices: 3,
        volume: -2,
        dry: 0.6,
        reverbSend: 0.6,
        delaySend: 0.45,
        noteLength: "8n",
        velocity: [0.5, 0.9],
        accents: [1],
        quantizeStrength: 0.3,
        filter: { type: "lowpass", frequency: 2600, Q: 0.7 },
        synth: {
          type: "fm",
          harmonicity: 2,
          modulationIndex: 2.5,
          oscillator: "sine",
          modulation: "triangle",
          envelope: { attack: 0.005, decay: 1.4, sustain: 0, release: 1.5 },
          modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0, release: 0.6 },
        },
      },
      wall: {
        pattern: "rippleHigh",
        octave: 5,
        register: { low: "A5", high: "E7" },
        voices: 3,
        volume: -6,
        dry: 0.45,
        reverbSend: 0.7,
        delaySend: 0.55,
        noteLength: "8n",
        velocity: [0.4, 0.8],
        accents: [1],
        quantizeStrength: 0.3,
        filter: { type: "lowpass", frequency: 9000, Q: 0.5 },
        synth: {
          type: "fm",
          harmonicity: 5.07,
          modulationIndex: 10,
          oscillator: "sine",
          modulation: "sine",
          envelope: { attack: 0.002, decay: 1.3, sustain: 0, release: 1.4 },
          modulationEnvelope: { attack: 0.002, decay: 0.6, sustain: 0, release: 0.8 },
        },
      },
    },
  };
}

/**
 * @param {{ analysis: object, brief?: string, overrides?: object, log?: Pick<Console, 'info'|'warn'> }} input
 * @returns {{ music: object, report: { key: object, keySource: string, fit: object, best: object, warnings: string[] } }}
 */
export function buildMusic({ analysis, brief = "", overrides = {}, log = console }) {
  const parsed = parseBrief(brief);
  const harmonyOverrides = overrides.harmony ?? {};
  const warnings = [];
  const warn = (message) => {
    warnings.push(message);
    log.warn(`[audio] ${message}`);
  };

  const { bpm, source: bpmSource } = resolveBpm(analysis, parsed);
  const { key, source: keySource } = resolveKey(overrides, parsed, analysis);
  const scale = scalePcs(key);
  const colors = chordColorsFrom(parsed, analysis);
  if (!colors.length) throw new Error("No chord colors found in the brief or analysis.");

  const fit = keyFit(colors, key);
  const ranked = rankKeys(colors, {
    pcStrength: analysis.tonality?.pitch_class_strength,
    keyCandidates: (analysis.tonality?.key_candidates ?? []).map((k) => k.key),
  });
  const best = ranked[0];
  const colorList = colors.map((c) => c.symbol).join(", ");
  log.info(`[audio] key ${key.tonic} ${key.mode} (${keySource}) fits ${fit.fits}/${fit.total} chord colors (${colorList})`);
  if (fit.fits < fit.total / 2) {
    warn(
      `Tonal center ${key.tonic} ${key.mode} fits only ${fit.fits}/${fit.total} chord colors (${colorList}). `
      + `Best fit: ${best.key.tonic} ${best.key.mode} (${best.fits}/${best.total}). `
      + `Set key in src/audio/music.overrides.js or the brief's "Tonal center" line.`,
    );
  }

  const snap = harmonyOverrides.snap ?? false;
  let chords = colors.map((chord) => {
    const borrowed = !chordFits(chord, scale);
    return snap && borrowed ? { ...snapChord(chord, key), borrowed: false } : { ...chord, borrowed };
  });
  chords = chords.filter((chord, i) => chords.findIndex((c) => c.symbol === chord.symbol) === i);

  const tonicPc = pcOf(key.tonic);
  let tonicIndex = chords.findIndex((chord) => pcOf(chord.root) === tonicPc);
  if (tonicIndex < 0) {
    chords.unshift({ ...diatonicChord(tonicPc, key, 9), borrowed: false });
    tonicIndex = 0;
    log.info(`[audio] no chord color on ${key.tonic}; added tonic ${chords[0].symbol} as i`);
  }
  chords = [chords[tonicIndex], ...chords.filter((_, i) => i !== tonicIndex)];

  const voicing = {
    bassLow: "C2",
    bassHigh: "B2",
    low: "D3",
    high: "D5",
    size: 4,
    ...harmonyOverrides.voicing,
  };
  const voicingMidi = {
    bassLow: noteToMidi(voicing.bassLow),
    bassHigh: noteToMidi(voicing.bassHigh),
    low: noteToMidi(voicing.low),
    high: noteToMidi(voicing.high),
    size: voicing.size,
  };

  const seed = harmonyOverrides.seed ?? hashSeed(JSON.stringify(analysis.harmony ?? {}), parsed.chordColors.join(","), key.tonic, key.mode);
  const order = harmonyOverrides.order ?? "smooth";
  const reference = referenceOrder(analysis);
  let ordered;
  let voicings;
  if (order === "shuffle") {
    ordered = orderShuffle(chords, seed, reference);
    voicings = voiceSequence(ordered, voicingMidi).voicings;
  } else {
    const result = orderSmooth(chords, voicingMidi, reference);
    ordered = result.order;
    voicings = result.voicings;
  }

  const barSeconds = (60 / bpm) * 4;
  const barsPerChord = harmonyOverrides.barsPerChord
    ?? clamp(Math.round((analysis.harmony?.avg_seconds_per_change ?? 30) / barSeconds), 2, 8);

  const progression = ordered.map((chord, i) => ({
    symbol: chord.symbol,
    root: chord.root,
    quality: chord.quality,
    degree: romanDegree(chord, key),
    borrowed: Boolean(chord.borrowed),
    bars: barsPerChord,
    notes: voicings[i].map(midiToNote),
  }));

  const brightness = analysis.texture?.brightness_centroid_hz_p10_p90 ?? [500, 1500];
  const padCutoff = Math.round(clamp(brightness[1] * 1.4, 500, 3000));
  const chordSeconds = barsPerChord * barSeconds;
  const sideToMid = analysis.stereo?.side_to_mid_ratio ?? 0.4;

  const music = {
    meta: {
      title: analysis.title ?? analysis.file ?? "reference",
      bpmSource,
      keySource,
      keyFit: `${fit.fits}/${fit.total}`,
      bestKey: `${best.key.tonic} ${best.key.mode} (${best.fits}/${best.total})`,
    },
    key,
    transport: { bpm, timeSignature: [4, 4] },
    harmony: { snap, order, seed, barsPerChord, voicing, progression },
    quantize: { grid: "16n", collision: "push", maxPushSlots: 1 },
    master: { volume: 0, limiter: -1, sceneFade: 1.5 },
    reverb: { decay: parsed.reverbDecay ?? 10, preDelay: 0.05 },
    page: { cutoff: 420, resonance: 3, rampTime: 2.5, openCutoff: 20000, openResonance: 0.7 },
    pad: {
      volume: -4,
      dry: 0.5,
      reverbSend: 0.85,
      velocity: 0.6,
      oscillator: { type: "fatsawtooth", count: 2, spread: Math.round(6 + 10 * sideToMid) },
      envelope: {
        attack: 2.5,
        decay: 3,
        sustain: 0.75,
        release: Math.round(Math.min(9, chordSeconds * 0.6) * 10) / 10,
      },
      filter: { frequency: padCutoff, Q: 0.6 },
      lfo: {
        rate: 0.035,
        min: Math.round(clamp(padCutoff * 1.2, 1200, 2400)),
        max: Math.round(clamp(padCutoff * 2.6, 2600, 5000)),
      },
      detuneLfo: { rate: 0.07, depth: 3 },
      voice: { vowel: "a", shift: 1, width: 1.6, mix: 0.9, gain: 14 },
      vibrato: { rate: 4.8, depth: 0.05 },
      chorus: { rate: 0.35, depth: 0.6, wet: 0.5 },
    },
    patterns: PATTERNS,
    scenes: sceneDefaults(),
    sfx: { volume: -10, frequency: 3400, Q: 1.2, jitter: 0.4, decay: 0.012, throttleMs: 40 },
  };

  return { music, report: { key, keySource, fit, best, warnings } };
}

export function renderModule(music) {
  return [
    "// Generated by scripts/audio/generate.mjs from scripts/audio/reference/*.",
    "// Do not edit: run `npm run audio:generate`; hand edits go in music.overrides.js.",
    "",
    "/** @type {import('./config.js').MusicConfig} */",
    `export default ${JSON.stringify(music, null, 2)};`,
    "",
  ].join("\n");
}

async function main() {
  const analysis = JSON.parse(readFileSync(PATHS.analysis, "utf8"));
  const brief = existsSync(PATHS.brief) ? readFileSync(PATHS.brief, "utf8") : "";
  const overrides = existsSync(PATHS.overrides)
    ? (await import(pathToFileURL(PATHS.overrides).href)).default ?? {}
    : {};
  const { music } = buildMusic({ analysis, brief, overrides });
  writeFileSync(PATHS.output, renderModule(music));
  const bars = music.harmony.progression.reduce((sum, chord) => sum + chord.bars, 0);
  console.info(
    `[audio] ${music.transport.bpm} BPM, ${bars} bars: `
    + music.harmony.progression.map((c) => `${c.symbol} (${c.degree}${c.borrowed ? ", borrowed" : ""})`).join(" -> "),
  );
  console.info(`[audio] wrote ${relative(ROOT, PATHS.output)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
