import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PATHS, buildMusic, renderModule } from "./generate.mjs";
import {
  chordAtTick,
  chordIntervals,
  chordPcs,
  chordScale,
  keyFit,
  loopBars,
  noteToMidi,
  pcOf,
  rankKeys,
  resolveToken,
} from "../../src/audio/harmony.js";
import { deepMerge } from "../../src/audio/config.js";

const PPQ = 192;
const SIXTEENTH = PPQ / 4;
const STEP_OF = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const mod12 = (value) => ((value % 12) + 12) % 12;

const reference = {
  analysis: JSON.parse(readFileSync(PATHS.analysis, "utf8")),
  brief: readFileSync(PATHS.brief, "utf8"),
};

const fixture = {
  analysis: {
    title: "fixture",
    tonality: {
      key_candidates: [{ key: "E minor", score: 0.8 }],
      pitch_class_strength: { E: 0.9, G: 0.6, B: 0.7, D: 0.5, A: 0.5, C: 0.4, "F#": 0.4 },
    },
    harmony: {
      avg_seconds_per_change: 10,
      timeline: [
        { chord: "Em9" }, { chord: "Cmaj9" }, { chord: "Am9" }, { chord: "Bm7" }, { chord: "Fmaj7" },
      ],
    },
    texture: { brightness_centroid_hz_p10_p90: [300, 1200] },
    rhythm: { pulse: "steady", pulse_clarity: 0.6, pulse_bpm_if_any: 96.4 },
    stereo: { side_to_mid_ratio: 0.3 },
  },
  brief: "",
};

const quiet = () => {
  const warnings = [];
  return { warnings, log: { info() {}, warn: (message) => warnings.push(message) } };
};

function build(source, overrides = {}) {
  const { log, warnings } = quiet();
  const { music } = buildMusic({ ...source, overrides, log });
  return { music, warnings };
}

/** Every scene voice as [name, voice]. */
function voicesOf(music) {
  const { meadow, cube, ice } = music.scenes;
  return [["meadow", meadow], ["cube", cube], ["ice.floor", ice.floor], ["ice.wall", ice.wall]];
}

function registerOf(voice) {
  return { octave: voice.octave, low: voice.register.low, high: voice.register.high };
}

function tokensOf(pattern) {
  return [...pattern.steps, ...(pattern.ornaments ?? [])];
}

for (const [label, source] of [["reference", reference], ["fixture", fixture]]) {
  test(`${label}: progression loop sums to N bars`, () => {
    const { music } = build(source);
    const { progression, barsPerChord } = music.harmony;
    assert.ok(progression.length >= 2);
    const total = loopBars(progression);
    assert.equal(total, progression.reduce((sum, chord) => sum + chord.bars, 0));
    assert.equal(total, progression.length * barsPerChord);
    assert.ok(barsPerChord >= 2 && barsPerChord <= 8);
    const barTicks = PPQ * music.transport.timeSignature[0];
    let bar = 0;
    progression.forEach((chord, index) => {
      assert.equal(chordAtTick(progression, bar * barTicks, PPQ), index, `downbeat of ${chord.symbol}`);
      assert.equal(chordAtTick(progression, (bar + chord.bars) * barTicks - 1, PPQ), index);
      bar += chord.bars;
    });
    assert.equal(chordAtTick(progression, total * barTicks, PPQ), 0, "wraps to the first chord");
  });

  test(`${label}: pad voicings stay in their registers and use chord tones`, () => {
    const { music } = build(source);
    const { voicing, progression } = music.harmony;
    for (const chord of progression) {
      const [bass, ...upper] = chord.notes.map(noteToMidi);
      assert.equal(upper.length, voicing.size - 1);
      assert.ok(bass >= noteToMidi(voicing.bassLow) && bass <= noteToMidi(voicing.bassHigh), `${chord.symbol} bass`);
      assert.equal(mod12(bass), pcOf(chord.root));
      for (const midi of upper) {
        assert.ok(midi >= noteToMidi(voicing.low) && midi <= noteToMidi(voicing.high), `${chord.symbol} ${midi}`);
        assert.ok(chordPcs(chord).includes(mod12(midi)), `${chord.symbol} tone ${midi}`);
      }
    }
  });

  test(`${label}: every pattern resolves inside every scene register`, () => {
    const { music } = build(source);
    for (const [name, voice] of voicesOf(music)) {
      const low = noteToMidi(voice.register.low);
      const high = noteToMidi(voice.register.high);
      assert.ok(high - low >= 12, `${name} register spans an octave`);
      for (const pattern of Object.values(music.patterns)) {
        for (const token of tokensOf(pattern)) {
          for (const chord of music.harmony.progression) {
            const midi = resolveToken(token, chord, music.key, registerOf(voice));
            assert.ok(midi >= low && midi <= high, `${name} ${token} over ${chord.symbol} -> ${midi}`);
          }
        }
      }
    }
  });

  test(`${label}: resolved notes belong to the chord playing at that tick`, () => {
    const { music } = build(source);
    const { progression } = music.harmony;
    const loopTicks = loopBars(progression) * PPQ * 4;
    for (const [name, voice] of voicesOf(music)) {
      const pattern = music.patterns[voice.pattern];
      assert.ok(pattern, `${name} pattern "${voice.pattern}" exists`);
      const tokens = tokensOf(pattern);
      let step = 0;
      for (let ticks = 0; ticks < loopTicks; ticks += SIXTEENTH) {
        const chord = progression[chordAtTick(progression, ticks, PPQ)];
        const token = tokens[step++ % tokens.length];
        const midi = resolveToken(token, chord, music.key, registerOf(voice));
        const interval = mod12(midi - pcOf(chord.root));
        const degreeStep = (Number(/\d+/.exec(token)[0]) - 1) % 7;
        const chordHasDegree = chordIntervals(chord).some((i) => STEP_OF[mod12(i)] === degreeStep);
        if (!token.startsWith("s") && chordHasDegree) {
          assert.ok(chordPcs(chord).includes(mod12(midi)), `${name} ${token} over ${chord.symbol} at ${ticks}`);
        } else {
          assert.ok(chordScale(chord, music.key).includes(interval), `${name} ${token} in ${chord.symbol} scale`);
        }
      }
    }
  });
}

test("reference: A# fits 1/4 chord colors, warns, and D# phrygian ranks best", () => {
  const { music, warnings } = build(reference);
  assert.deepEqual(music.key, { tonic: "A#", mode: "aeolian" });
  assert.equal(music.meta.keyFit, "1/4");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /fits only 1\/4/);
  assert.match(warnings[0], /D# phrygian \(3\/4\)/);

  const colors = ["D#m9", "G#m9", "F#m9", "Emaj9"].map((symbol) => ({
    root: symbol.replace(/m9|maj9/, ""),
    quality: symbol.endsWith("maj9") ? "maj9" : "m9",
  }));
  assert.equal(keyFit(colors, { tonic: "A#", mode: "aeolian" }).fits, 1);
  const [best] = rankKeys(colors, { pcStrength: reference.analysis.tonality.pitch_class_strength });
  assert.equal(`${best.key.tonic} ${best.key.mode}`, "D# phrygian");
  assert.equal(best.fits, 3);
});

test("reference: overriding the key to D# phrygian silences the warning", () => {
  const { music, warnings } = build(reference, { key: { tonic: "D#", mode: "phrygian" } });
  assert.equal(warnings.length, 0);
  assert.equal(music.harmony.progression[0].symbol, "D#m9");
  const borrowed = music.harmony.progression.filter((chord) => chord.borrowed).map((chord) => chord.symbol);
  assert.deepEqual(borrowed, ["F#m9"]);
});

test("reference: smooth order starts on i and does not copy the reference order", () => {
  const { music } = build(reference, { key: { tonic: "D#", mode: "phrygian" } });
  const order = music.harmony.progression.map((chord) => chord.symbol);
  assert.equal(music.harmony.progression[0].degree, "i");
  assert.notDeepEqual(order, ["D#m9", "G#m9", "F#m9", "Emaj9"]);
});

test("fixture: BPM from a clear pulse, key from analysis, borrowed chord kept", () => {
  const { music, warnings } = build(fixture);
  assert.equal(music.transport.bpm, 96);
  assert.deepEqual(music.transport.timeSignature, [4, 4]);
  assert.deepEqual(music.key, { tonic: "E", mode: "aeolian" });
  assert.equal(warnings.length, 0);
  const fmaj7 = music.harmony.progression.find((chord) => chord.root === "F");
  assert.ok(fmaj7?.borrowed, "Fmaj7 stays as a borrowed chord");
  assert.equal(fmaj7.symbol, "Fmaj7");
});

test("fixture: snap = true replaces borrowed chords with diatonic ones", () => {
  const { music } = build(fixture, { harmony: { snap: true } });
  assert.ok(music.harmony.progression.every((chord) => !chord.borrowed));
});

test("fixture: shuffle is seeded, starts on i, and avoids the reference order", () => {
  const a = build(fixture, { harmony: { order: "shuffle" } }).music.harmony.progression.map((c) => c.symbol);
  const b = build(fixture, { harmony: { order: "shuffle" } }).music.harmony.progression.map((c) => c.symbol);
  assert.deepEqual(a, b);
  assert.equal(a[0], "Em9");
  assert.notDeepEqual(a, ["Em9", "Cmaj9", "Am9", "Bm7", "Fmaj7"]);
});

test("beatless reference falls back to 70 BPM", () => {
  assert.equal(build(reference).music.transport.bpm, 70);
});

test("rendered module is valid JS that round-trips", async () => {
  const { music } = build(reference);
  const source = renderModule(music);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { default: loaded } = await import(url);
  assert.deepEqual(loaded, music);
});

test("deepMerge: objects merge, arrays replace, base untouched", () => {
  const base = { a: { b: 1, c: [1, 2, 3] }, d: "x" };
  const merged = deepMerge(base, { a: { c: [9] }, e: true });
  assert.deepEqual(merged, { a: { b: 1, c: [9] }, d: "x", e: true });
  assert.deepEqual(base.a.c, [1, 2, 3]);
});
