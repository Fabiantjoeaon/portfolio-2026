import * as Tone from "tone";
import generated from "./music.generated.js";
import overrides from "./music.overrides.js";
import { deepMerge, diffConfig, mergeConfig } from "./config.js";
import { AUDIO_EVENT, AUDIO_SCENE_EVENT } from "./audio.js";
import { chordAtTick, loopBars, midiToFrequency, noteToMidi, resolveToken, voiceChord } from "./harmony.js";

/** @typedef {import('./config.js').MusicConfig} MusicConfig */
/** @typedef {import('./config.js').SceneVoice} SceneVoice */
/** @typedef {import('./audio.js').AudioMessage} AudioMessage */

const PAGE_SCENES = new Set(["about", "project"]);
const MUTE_KEY = "audio:muted";
const RATE_TIME_CONSTANT = 0.6;
const GESTURES = ["pointerdown", "keydown", "touchend"];

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const lerp = (a, b, t) => a + (b - a) * t;

const SYNTHS = { fm: Tone.FMSynth, am: Tone.AMSynth, synth: Tone.Synth };

/** @param {SceneVoice['synth']} synth */
function synthOptions(synth) {
  const oscillator = typeof synth.oscillator === "object" ? { ...synth.oscillator } : { type: synth.oscillator ?? "sine" };
  const options = { oscillator, envelope: { ...synth.envelope } };
  if (synth.type === "fm" || synth.type === "am") {
    options.harmonicity = synth.harmonicity ?? 1;
    options.modulation = { type: synth.modulation ?? "sine" };
    if (synth.modulationEnvelope) options.modulationEnvelope = { ...synth.modulationEnvelope };
    if (synth.type === "fm") options.modulationIndex = synth.modulationIndex ?? 4;
  }
  return options;
}

/** Fixed pool of mono voices; a free voice if any, else the oldest is stolen. */
class VoicePool {
  constructor(output, onCreate = null) {
    this.output = output;
    this.onCreate = onCreate;
    this.voices = [];
    this.type = null;
  }

  /** @param {SceneVoice['synth']} synth @param {number} size */
  configure(synth, size) {
    const options = synthOptions(synth);
    if (synth.type === this.type && size === this.voices.length) {
      for (const voice of this.voices) voice.synth.set(options);
      return;
    }
    this.dispose();
    this.type = synth.type;
    const Synth = SYNTHS[synth.type] ?? Tone.Synth;
    for (let i = 0; i < size; i++) {
      const synth = new Synth(options).connect(this.output);
      this.onCreate?.(synth);
      this.voices.push({ synth, busyUntil: 0, startedAt: 0 });
    }
  }

  play(frequency, duration, time, velocity) {
    let pick = null;
    for (const voice of this.voices) {
      if (voice.busyUntil <= time && (!pick || voice.busyUntil < pick.busyUntil)) pick = voice;
    }
    if (!pick) {
      for (const voice of this.voices) if (!pick || voice.startedAt < pick.startedAt) pick = voice;
    }
    if (!pick) return;
    const release = pick.synth.envelope.release;
    pick.synth.triggerAttackRelease(frequency, duration, time, velocity);
    pick.startedAt = time;
    pick.busyUntil = time + duration + Tone.Time(release).toSeconds();
  }

  get active() {
    const now = Tone.now();
    let count = 0;
    for (const voice of this.voices) if (voice.busyUntil > now) count++;
    return count;
  }

  dispose() {
    for (const voice of this.voices) voice.synth.dispose();
    this.voices.length = 0;
    this.type = null;
  }
}

/** volume -> level (scene fade) -> dry (MusicBus) + reverb send (+ delay send) */
class Channel {
  constructor(engine, withDelay = false) {
    this.input = new Tone.Volume(0);
    this.level = new Tone.Gain(0);
    this.dry = new Tone.Gain(0).connect(engine.musicBus);
    this.reverbSend = new Tone.Gain(0).connect(engine.reverb);
    this.input.connect(this.level);
    this.level.fan(this.dry, this.reverbSend);
    if (withDelay) {
      this.delaySend = new Tone.Gain(0).connect(engine.delayInput);
      this.level.connect(this.delaySend);
    }
  }

  set({ volume, dry, reverbSend, delaySend }) {
    this.input.volume.rampTo(volume, 0.05);
    this.dry.gain.rampTo(dry, 0.05);
    this.reverbSend.gain.rampTo(reverbSend, 0.05);
    if (this.delaySend) this.delaySend.gain.rampTo(delaySend ?? 0, 0.05);
  }

  fade(target, seconds) {
    this.level.gain.rampTo(target, seconds);
  }

  dispose() {
    this.input.dispose();
    this.level.dispose();
    this.dry.dispose();
    this.reverbSend.dispose();
    this.delaySend?.dispose();
  }
}

/** One interactive instrument: its pattern cursor, voices, filter and channel. */
class Layer {
  /** @param {() => SceneVoice} getConfig */
  constructor(engine, getConfig, { pan = false, delay = false } = {}) {
    this.engine = engine;
    this.getConfig = getConfig;
    this.channel = new Channel(engine, delay);
    this.panner = pan ? new Tone.Panner(0).connect(this.channel.input) : null;
    this.filter = new Tone.Filter({ type: "lowpass", frequency: 2000 }).connect(this.panner ?? this.channel.input);
    this.pool = new VoicePool(this.filter);
    this.step = 0;
    this.ornament = 0;
    this.played = 0;
    this.lastMidi = -1;
    this.register = { octave: 4, low: 0, high: 127 };
  }

  apply() {
    const config = this.getConfig();
    this.pool.configure(config.synth, config.voices);
    this.filter.set(config.filter);
    this.channel.set(config);
    this.register.octave = config.octave;
    this.register.low = noteToMidi(config.register.low);
    this.register.high = noteToMidi(config.register.high);
  }

  /** Next pattern note for `chord`; advances once per played note, skipping repeats. */
  nextMidi(chord, density) {
    const config = this.getConfig();
    const patterns = this.engine.config.patterns;
    const pattern = patterns[config.pattern] ?? Object.values(patterns)[0];
    const { steps, ornaments = [] } = pattern;
    const every = config.density?.ornamentEvery ?? 0;
    const key = this.engine.config.key;
    let midi = -1;
    if (ornaments.length && every > 0 && density > 0.75 && this.played % every === every - 1) {
      midi = resolveToken(ornaments[this.ornament++ % ornaments.length], chord, key, this.register);
      this.step++;
    }
    for (let tries = 0; midi < 0 || (midi === this.lastMidi && tries < steps.length); tries++) {
      midi = resolveToken(steps[this.step++ % steps.length], chord, key, this.register);
    }
    this.played++;
    this.lastMidi = midi;
    return midi;
  }

  play(time, chord, intensity, density, accentIndex, pan = null) {
    const config = this.getConfig();
    const midi = this.nextMidi(chord, density);
    const accents = config.accents?.length ? config.accents : [1];
    const accent = accents[accentIndex % accents.length];
    const velocity = lerp(config.velocity[0], config.velocity[1], clamp01(intensity)) * (0.55 + 0.45 * accent);
    if (this.panner && pan !== null) this.panner.pan.setValueAtTime(pan, time);
    this.pool.play(midiToFrequency(midi), Tone.Time(config.noteLength).toSeconds(), time, velocity);
    return midi;
  }

  dispose() {
    this.pool.dispose();
    this.filter.dispose();
    this.panner?.dispose();
    this.channel.dispose();
  }
}

/** One note per scene per grid slot; bursts are pushed or dropped, never stacked. */
class Quantizer {
  constructor() {
    this.lastSlot = -Infinity;
    this.lastEvent = 0;
    this.rate = 0;
  }

  /** Events/sec EMA, `count` includes events coalesced by the facade. */
  observe(now, count) {
    const dt = Math.max(0.016, now - this.lastEvent);
    this.lastEvent = now;
    const k = 1 - Math.exp(-dt / RATE_TIME_CONSTANT);
    this.rate += (count / dt - this.rate) * k;
  }

  density(settings) {
    if (!settings) return 1;
    return clamp01((this.rate - settings.rateLow) / Math.max(0.001, settings.rateHigh - settings.rateLow));
  }

  slot(transport, unit, quantize) {
    const unitSeconds = Tone.Time(unit).toSeconds();
    const natural = transport.nextSubdivision(unit);
    let time = natural;
    if (time < this.lastSlot + unitSeconds * 0.5) {
      if (quantize.collision !== "push") return -1;
      time = this.lastSlot + unitSeconds;
      if (time - natural > quantize.maxPushSlots * unitSeconds + 1e-4) return -1;
    }
    this.lastSlot = time;
    return time;
  }
}

export class AudioEngine {
  /** @param {MusicConfig} config */
  constructor(config) {
    this.config = config;
    this.baseline = structuredClone(config);
    this.scene = null;
    this.previewPage = false;
    this.muted = localStorage.getItem(MUTE_KEY) === "1";
    this.started = false;
    this.hidden = false;
    this.state = { chord: "-", scene: "-", voices: "" };
    this._padEvents = [];
    this._padFrequencies = [];
    this._signatures = {};
    this._lastClick = 0;
    this._suspendTimer = 0;
    this.quantizers = { meadow: new Quantizer(), cube: new Quantizer(), ice: new Quantizer() };

    this._onGesture = () => this.start();
    this._onVisibility = () => this._setHidden(document.hidden);
    this._onKey = (event) => {
      if (event.code !== "KeyM" || event.repeat || event.metaKey || event.ctrlKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]")) return;
      this.setMuted(!this.muted);
    };
    for (const type of GESTURES) window.addEventListener(type, this._onGesture, { capture: true, passive: true });
    window.addEventListener("keydown", this._onKey);
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  async start() {
    if (this.started) return;
    this.started = true;
    for (const type of GESTURES) window.removeEventListener(type, this._onGesture, { capture: true });
    Tone.setContext(new Tone.Context({ latencyHint: "interactive", lookAhead: 0.05 }));
    await Tone.start();
    this._build();
    this.applyConfig(this.config);
    await this.reverb.ready;
    this.transport.start("+0.1");
    this._applyScene(0);
    if (document.hidden) this._setHidden(true);
  }

  _build() {
    const config = this.config;
    this.transport = Tone.getTransport();
    this.master = new Tone.Gain(0).toDestination();
    this.limiter = new Tone.Limiter(config.master.limiter).connect(this.master);
    this.musicLowpass = new Tone.Filter({ type: "lowpass", rolloff: -24, frequency: config.page.openCutoff, Q: config.page.openResonance }).connect(this.limiter);
    this.musicBus = new Tone.Gain(1).connect(this.musicLowpass);
    this.sfxBus = new Tone.Volume(config.sfx.volume).connect(this.limiter);

    this.reverb = new Tone.Reverb({ decay: config.reverb.decay, preDelay: config.reverb.preDelay, wet: 1 }).connect(this.musicBus);
    this._changed("reverb", config.reverb);
    this.delayInput = new Tone.Gain(1);
    this.delay = new Tone.FeedbackDelay({ delayTime: config.scenes.ice.delay.time, feedback: config.scenes.ice.delay.feedback, wet: 1 });
    this.delayFilter = new Tone.Filter({ type: "lowpass", frequency: config.scenes.ice.delay.filter });
    this.delayToReverb = new Tone.Gain(0.5).connect(this.reverb);
    this.delayInput.chain(this.delay, this.delayFilter);
    this.delayFilter.fan(this.musicBus, this.delayToReverb);

    this.padChannel = new Channel(this);
    this.padChannel.fade(1, 0);
    this.padFilter = new Tone.Filter({ type: "lowpass", rolloff: -24 }).connect(this.padChannel.input);
    this.padLfo = new Tone.LFO({ type: "sine" }).connect(this.padFilter.frequency).start();
    this.padDetuneLfo = new Tone.LFO({ type: "sine" }).start();
    this.pad = new VoicePool(this.padFilter, (synth) => this.padDetuneLfo.connect(synth.detune));

    this.layers = {
      meadow: new Layer(this, () => this.config.scenes.meadow),
      cube: new Layer(this, () => this.config.scenes.cube),
      iceFloor: new Layer(this, () => this.config.scenes.ice.floor, { pan: true, delay: true }),
      iceWall: new Layer(this, () => this.config.scenes.ice.wall, { pan: true, delay: true }),
    };

    this.clickFilter = new Tone.Filter({ type: "bandpass" }).connect(this.sfxBus);
    this.click = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.012, sustain: 0, release: 0.004 } }).connect(this.clickFilter);
  }

  /** @param {MusicConfig} config */
  applyConfig(config) {
    this.config = config;
    if (!this.transport) return;
    const { transport, reverb, scenes, sfx, master } = config;
    this.transport.bpm.value = transport.bpm;
    this.transport.timeSignature = transport.timeSignature[0];
    this.limiter.threshold.value = master.limiter;
    this.master.gain.rampTo(this._masterGain(), 0.1);

    if (this._changed("reverb", reverb)) {
      this.reverb.decay = reverb.decay;
      this.reverb.preDelay = reverb.preDelay;
    }
    this.delay.delayTime.rampTo(Tone.Time(scenes.ice.delay.time).toSeconds(), 0.1);
    this.delay.feedback.rampTo(scenes.ice.delay.feedback, 0.1);
    this.delayFilter.frequency.rampTo(scenes.ice.delay.filter, 0.1);

    this._applyPad();
    for (const layer of Object.values(this.layers)) layer.apply();

    this.sfxBus.volume.rampTo(sfx.volume, 0.05);
    this.clickFilter.Q.value = sfx.Q;
    this.click.envelope.decay = sfx.decay;

    if (this._changed("harmony", [config.harmony, config.transport.timeSignature])) this._schedulePad();
    this._applyScene(0.1);
  }

  _changed(name, value) {
    const signature = JSON.stringify(value);
    if (this._signatures[name] === signature) return false;
    this._signatures[name] = signature;
    return true;
  }

  _applyPad() {
    const { pad, harmony } = this.config;
    const minBars = Math.min(...harmony.progression.map((chord) => chord.bars));
    const chordSeconds = minBars * Tone.Time("1m").toSeconds();
    const envelope = { ...pad.envelope, release: Math.min(pad.envelope.release, chordSeconds * 0.8) };
    this.pad.configure({ type: "synth", oscillator: pad.oscillator, envelope }, harmony.voicing.size * 2 + 2);
    this.padChannel.set(pad);
    this.padFilter.Q.value = pad.filter.Q;
    this.padLfo.set({ frequency: pad.lfo.rate, min: pad.lfo.min, max: pad.lfo.max });
    this.padDetuneLfo.set({ frequency: pad.detuneLfo.rate, min: -pad.detuneLfo.depth, max: pad.detuneLfo.depth });
  }

  _schedulePad() {
    for (const id of this._padEvents) this.transport.clear(id);
    this._padEvents.length = 0;
    const { progression, voicing } = this.config.harmony;
    const range = {
      bassLow: noteToMidi(voicing.bassLow),
      bassHigh: noteToMidi(voicing.bassHigh),
      low: noteToMidi(voicing.low),
      high: noteToMidi(voicing.high),
      size: voicing.size,
    };
    let prev = null;
    this._padFrequencies = progression.map((chord) => {
      prev = chord.notes?.length ? chord.notes.map(noteToMidi) : voiceChord(chord, prev, range);
      return prev.map(midiToFrequency);
    });
    const total = loopBars(progression);
    let bar = 0;
    progression.forEach((chord, index) => {
      this._padEvents.push(this.transport.scheduleRepeat((time) => this._playChord(index, time), `${total}m`, `${bar}m`));
      bar += chord.bars;
    });
  }

  /** Released on the audio clock at the next chord's downbeat, so the tail overlaps the next attack. */
  _playChord(index, time) {
    const chord = this.config.harmony.progression[index];
    const frequencies = this._padFrequencies[index];
    if (!chord || !frequencies) return;
    const seconds = chord.bars * Tone.Time("1m").toSeconds();
    const velocity = this.config.pad.velocity;
    for (const frequency of frequencies) this.pad.play(frequency, seconds, time, velocity);
    this.state.chord = `${chord.symbol}${chord.degree ? ` (${chord.degree})` : ""}`;
  }

  _chordAt(time) {
    const progression = this.config.harmony.progression;
    const ticks = this.transport.getTicksAtTime(time);
    return progression[chordAtTick(progression, ticks, this.transport.PPQ, this.config.transport.timeSignature[0])];
  }

  get pageMode() {
    return this.previewPage || PAGE_SCENES.has(this.scene);
  }

  /** @param {AudioMessage} message */
  handle(message) {
    if (message.kind === "mute") this.setMuted(message.muted);
    else if (message.kind === "trigger") this.trigger(message.scene, message.event, message.count);
  }

  setScene(scene) {
    if (scene === this.scene) return;
    this.scene = scene;
    this.state.scene = scene;
    this._applyScene(this.config.master.sceneFade);
  }

  _applyScene(fade) {
    if (!this.layers) return;
    fade = Math.max(0.01, fade);
    const page = this.pageMode;
    const target = (name) => (!page && this.scene === name ? 1 : 0);
    this.layers.meadow.channel.fade(target("meadow"), fade);
    this.layers.cube.channel.fade(target("cube"), fade);
    this.layers.iceFloor.channel.fade(target("ice"), fade);
    this.layers.iceWall.channel.fade(target("ice"), fade);
    const { page: settings } = this.config;
    const ramp = fade > 0.01 ? settings.rampTime : 0.01;
    this.musicLowpass.frequency.rampTo(page ? settings.cutoff : settings.openCutoff, ramp);
    this.musicLowpass.Q.rampTo(page ? settings.resonance : settings.openResonance, ramp);
  }

  trigger(scene, event, count = 1) {
    if (!this.layers || this.hidden) return;
    if (scene === "ui") {
      if (event.type === "tileHover") this.playClick();
      return;
    }
    if (this.pageMode || scene !== this.scene || this.transport.state !== "started") return;
    const quantizer = this.quantizers[scene];
    const now = Tone.now();
    quantizer.observe(now, count);

    if (scene === "ice") {
      const wall = event.surface === "wall";
      const layer = wall ? this.layers.iceWall : this.layers.iceFloor;
      const ice = this.config.scenes.ice;
      const pan = Math.max(-1, Math.min(1, (event.position?.x ?? 0) / ice.panWidth)) * ice.panAmount;
      this._playLayer(layer, quantizer, 0.8, pan);
      return;
    }
    this._playLayer(this.layers[scene], quantizer, event.intensity ?? 0.5, null);
  }

  _playLayer(layer, quantizer, intensity, pan) {
    const config = layer.getConfig();
    const quantize = this.config.quantize;
    const density = quantizer.density(config.density);
    const unit = config.density && density < 0.5 ? config.density.sparseGrid : quantize.grid;
    const time = quantizer.slot(this.transport, unit, quantize);
    if (time < 0) return;
    const ticks = this.transport.getTicksAtTime(time);
    const accentIndex = Math.round(ticks / (this.transport.PPQ / 4));
    layer.play(time, this._chordAt(time), Math.max(intensity, density), density, accentIndex, pan);
  }

  playClick() {
    if (this.muted) return;
    const { sfx } = this.config;
    const now = performance.now();
    if (now - this._lastClick < sfx.throttleMs) return;
    this._lastClick = now;
    const time = Tone.immediate();
    const jitter = Math.pow(2, sfx.jitter * (Math.random() * 2 - 1));
    this.clickFilter.frequency.setValueAtTime(sfx.frequency * jitter, time);
    this.click.triggerAttackRelease(sfx.decay * (0.7 + Math.random() * 0.6), time, 0.6 + Math.random() * 0.4);
  }

  _masterGain() {
    return this.muted || this.hidden ? 0 : Tone.dbToGain(this.config.master.volume);
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    this.master?.gain.rampTo(this._masterGain(), 0.2);
  }

  _setHidden(hidden) {
    this.hidden = hidden;
    if (!this.master) return;
    clearTimeout(this._suspendTimer);
    const context = Tone.getContext();
    if (hidden) {
      this.master.gain.rampTo(0, 0.15);
      this._suspendTimer = setTimeout(() => {
        this.transport.pause();
        context.rawContext.suspend();
      }, 250);
    } else {
      context.resume().then(() => {
        if (this.hidden) return;
        if (this.transport.state !== "started") this.transport.start("+0.05");
        this.master.gain.rampTo(this._masterGain(), 0.4);
      });
    }
  }

  voiceCounts() {
    if (!this.layers) return "";
    const layers = Object.entries(this.layers).map(([name, layer]) => `${name} ${layer.pool.active}`);
    return `pad ${this.pad.active} · ${layers.join(" · ")}`;
  }

  /**
   * Debug: simulates a fast gesture (one event every `interval` ms) so the
   * quantizer, push/drop and density can be heard. Switches the audio scene.
   * @param {'meadow'|'cube'|'iceFloor'|'iceWall'} target
   */
  burst(target, count = 24, interval = 35) {
    const ice = target === "iceFloor" || target === "iceWall";
    this.scene = ice ? "ice" : target;
    this.state.scene = this.scene;
    this.previewPage = false;
    this._applyScene(0.05);
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (ice) {
          const surface = target === "iceWall" ? "wall" : "floor";
          this.trigger("ice", { type: "surfaceClick", surface, position: { x: (Math.random() - 0.5) * 40, y: 0, z: 0 } });
        } else if (target === "cube") {
          this.trigger("cube", { type: "cubeHover", id: i, intensity: 0.8 });
        } else {
          this.trigger("meadow", { type: "flowerSpawn", intensity: 0.8 });
        }
      }, i * interval);
    }
  }

  /** The live config as a patch over the current overrides, ready to paste. */
  overridesSnippet() {
    const diff = diffConfig(this.baseline, this.config) ?? {};
    const merged = deepMerge(currentOverrides, diff);
    return `/** @type {import('./config.js').MusicOverrides} */\nexport default ${JSON.stringify(merged, null, 2)};\n`;
  }

  describeProgression() {
    return this.config.harmony.progression
      .map((chord) => `${chord.symbol} ${chord.notes?.join(" ") ?? ""}`.trim())
      .join(" | ");
  }
}

let currentGenerated = generated;
let currentOverrides = overrides;
/** @type {AudioEngine | null} */
let engine = null;

/**
 * Main thread only. Scene code talks to it through `audio` (./audio.js) via
 * the dispatcher, which also bridges events from the offscreen worker.
 * @param {import('@/shared/dispatcher').default} dispatcher
 */
export function initAudio(dispatcher) {
  if (engine) return engine;
  engine = new AudioEngine(mergeConfig(currentGenerated, currentOverrides));
  dispatcher.on(AUDIO_EVENT, (message) => engine.handle(message));
  dispatcher.on(AUDIO_SCENE_EVENT, ({ scene }) => engine.setScene(scene));
  if (dispatcher.data[AUDIO_SCENE_EVENT]) engine.setScene(dispatcher.data[AUDIO_SCENE_EVENT].scene);

  const gui = dispatcher.data.debug?.gui;
  if (gui) import("./AudioDebug.js").then(({ createAudioDebug }) => createAudioDebug(engine, gui));
  return engine;
}

if (import.meta.hot) {
  import.meta.hot.accept(["./music.generated.js", "./music.overrides.js"], ([nextGenerated, nextOverrides]) => {
    if (nextGenerated) currentGenerated = nextGenerated.default;
    if (nextOverrides) currentOverrides = nextOverrides.default;
    if (!engine) return;
    const config = mergeConfig(currentGenerated, currentOverrides);
    engine.baseline = structuredClone(config);
    engine.applyConfig(config);
  });
}
