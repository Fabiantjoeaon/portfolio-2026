import { generated, overrides, song } from "./music.js";
import { assignDeep, countLeaves, deepMerge, diffConfig, mergeConfig, renderOverrides } from "./config.js";
import { getFlag } from "@/offscreen/lib/query";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";
import { isMobileOrTablet } from "@/shared/devices";
import { AUDIO_EVENT, AUDIO_SCENE_EVENT } from "./audio.js";
import { enablePlaybackSession, releasePlaybackSession } from "./playbackSession.js";
import { fold, midiToFrequency, midiToNote, noteToMidi, scalePcs } from "./harmony.js";
import { parseMidi, toPart } from "./midi.js";
import { buildFollowPools, countInRange, indexInRange, maskOf, nthInRange, outOfKey, snapToMask } from "./follow.js";

/** @typedef {import('./config.js').MusicConfig} MusicConfig */
/** @typedef {import('./config.js').SceneVoice} SceneVoice */
/** @typedef {import('./config.js').TrackVoice} TrackVoice */
/** @typedef {import('./audio.js').AudioMessage} AudioMessage */
/** @typedef {import('./midi.js').MidiPart} MidiPart */

const PAGE_SCENES = new Set(["about", "project"]);
const MUTE_KEY = "audio:muted";
const RATE_TIME_CONSTANT = 0.6;
// Only some of these count as user activation (touch pointerdown and modifier
// keys don't), so every one retries until the context runs.
const GESTURES = ["pointerdown", "pointerup", "click", "keydown", "touchend"];
const LOOK_AHEAD = 0.12;
const MIDI_PARTS = ["pad", "arp", "bass"];
const UNISON = [0];

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const lerp = (a, b, t) => a + (b - a) * t;

/** Prepared during loading so gesture-time resume stays synchronous. @type {typeof import("tone")} */
let Tone;
const SYNTHS = { fm: "FMSynth", am: "AMSynth", synth: "Synth", mono: "MonoSynth" };

const seconds = (time) => (typeof time === "number" ? time : Tone.Time(time).toSeconds());

/** @param {import('./config.js').Synth} synth */
function synthOptions(synth, portamento = 0) {
  const oscillator = typeof synth.oscillator === "object" ? { ...synth.oscillator } : { type: synth.oscillator ?? "sine" };
  const options = { oscillator, envelope: { ...synth.envelope }, portamento };
  if (synth.type === "fm" || synth.type === "am") {
    options.harmonicity = synth.harmonicity ?? 1;
    options.modulation = { type: synth.modulation ?? "sine" };
    if (synth.modulationEnvelope) options.modulationEnvelope = { ...synth.modulationEnvelope };
    if (synth.type === "fm") options.modulationIndex = synth.modulationIndex ?? 4;
  }
  if (synth.type === "mono") {
    options.filter = { type: "lowpass", ...synth.filter };
    options.filterEnvelope = { ...synth.filterEnvelope };
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

  configure(synth, size, portamento = 0) {
    const options = synthOptions(synth, portamento);
    if (synth.type === this.type && size === this.voices.length) {
      for (const voice of this.voices) voice.synth.set(options);
      return;
    }
    this.dispose();
    this.type = synth.type;
    const Synth = Tone[SYNTHS[synth.type] ?? "Synth"];
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
    pick.synth.triggerAttackRelease(frequency, duration, time, velocity);
    pick.startedAt = time;
    pick.busyUntil = time + duration + seconds(pick.synth.envelope.release);
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

/** One feedback delay: input is the send, output is wet only (the dry path stays on the channel). */
class Echo {
  constructor(musicBus, reverb) {
    this.input = new Tone.Gain(1);
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.3, feedback: 0.3, wet: 1, maxDelay: 2 });
    this.filter = new Tone.Filter({ type: "lowpass", frequency: 4000 });
    this.toReverb = new Tone.Gain(0.5).connect(reverb);
    this.input.chain(this.delay, this.filter);
    this.filter.fan(musicBus, this.toReverb);
  }

  set({ time, feedback, filter }) {
    this.delay.delayTime.rampTo(Math.min(seconds(time), 1.9), 0.05);
    this.delay.feedback.rampTo(feedback, 0.05);
    this.filter.frequency.rampTo(filter, 0.05);
  }
}

/** volume -> level (scene fade) -> dry (MusicBus) + reverb send (+ delay send) */
class Channel {
  constructor(engine, echo = null) {
    this.input = new Tone.Volume(0);
    this.level = new Tone.Gain(0);
    this.dry = new Tone.Gain(0).connect(engine.musicBus);
    this.reverbSend = new Tone.Gain(0).connect(engine.reverb);
    this.input.connect(this.level);
    this.level.fan(this.dry, this.reverbSend);
    if (echo) {
      this.delaySend = new Tone.Gain(0).connect(echo.input);
      this.level.connect(this.delaySend);
    }
    this.target = 0;
    this.until = 0;
  }

  set({ volume, dry, reverbSend, delaySend }) {
    this.input.volume.rampTo(volume, 0.05);
    this.dry.gain.rampTo(dry, 0.05);
    this.reverbSend.gain.rampTo(reverbSend, 0.05);
    if (this.delaySend) this.delaySend.gain.rampTo(delaySend ?? 0, 0.05);
  }

  fade(target, seconds) {
    if (target === this.target && this.until) return;
    this.target = target;
    this.until = Tone.now() + seconds;
    this.level.gain.rampTo(target, seconds);
  }

  /** Faded out by `time`, so notes there would be inaudible. */
  silent(time) {
    return this.target === 0 && time >= this.until;
  }

  dispose() {
    this.input.dispose();
    this.level.dispose();
    this.dry.dispose();
    this.reverbSend.dispose();
    this.delaySend?.dispose();
  }
}

/** A looping MIDI part played through a voice pool; skipped while its channel is silent. */
class MidiTrack {
  /** @param {() => TrackVoice} getConfig */
  constructor(engine, getConfig, channel, { filter = false, onCreate = null, output = null } = {}) {
    this.engine = engine;
    this.getConfig = getConfig;
    this.channel = channel;
    this.filter = filter ? new Tone.Filter({ type: "lowpass", frequency: 2000 }).connect(channel.input) : null;
    this.pool = new VoicePool(output ?? this.filter ?? channel.input, onCreate);
    this.part = null;
    this.onNote = null;
  }

  apply() {
    const config = this.getConfig();
    this.pool.configure(config.synth, config.voices, config.portamento ?? 0);
    this.filter?.set(config.filter);
    this.channel.set(config);
  }

  /** @param {MidiPart | null} part */
  schedule(part) {
    this.part?.dispose();
    this.part = null;
    if (!part) return;
    const labels = new Map();
    for (const note of part.notes) labels.set(note.tick, `${labels.get(note.tick) ?? ""} ${midiToNote(note.midi)}`.trim());
    const events = part.notes.map((note) => ({ time: `${note.tick}i`, note, label: labels.get(note.tick) }));
    this.part = new Tone.Part((time, event) => this.play(time, event), events);
    this.part.loop = true;
    this.part.loopEnd = `${part.loopTicks}i`;
    this.part.start(0);
  }

  play(time, event) {
    if (this.channel.silent(time)) return;
    const config = this.getConfig();
    const { note } = event;
    const midi = note.midi + 12 * (config.octave ?? 0);
    const duration = note.duration * this.engine.tickSeconds * (config.gate ?? 1);
    this.pool.play(midiToFrequency(midi), duration, time, note.velocity * config.velocity);
    this.onNote?.(event);
  }

  dispose() {
    this.part?.dispose();
    this.pool.dispose();
    this.filter?.dispose();
    this.channel.dispose();
  }
}

/** One interactive instrument: follows the arp's pitch pool, plus voices, filter and channel. */
class Layer {
  /** @param {() => SceneVoice} getConfig */
  constructor(engine, getConfig, { pan = false, echo = null, below = false } = {}) {
    this.engine = engine;
    this.getConfig = getConfig;
    this.below = below;
    this.channel = new Channel(engine, echo);
    this.panner = pan ? new Tone.Panner(0).connect(this.channel.input) : null;
    this.filter = new Tone.Filter({ type: "lowpass", frequency: 2000 }).connect(this.panner ?? this.channel.input);
    this.pool = new VoicePool(this.filter);
    this.step = 0;
    this.played = 0;
    this.lastMidi = -1;
    this.noteSeconds = 0.1;
    this.register = { low: 0, high: 127 };
  }

  apply() {
    const config = this.getConfig();
    this.pool.configure(config.synth, config.voices);
    this.filter.set(config.filter);
    this.channel.set(config);
    this.noteSeconds = seconds(config.noteLength);
    this.register.low = noteToMidi(config.register.low);
    this.register.high = Math.max(this.register.low, noteToMidi(config.register.high));
  }

  /**
   * "pool" walks the phrase upwards from the register's low note, "echo"
   * offsets it from the arp note at this sixteenth. Always in key.
   */
  nextMidi(sixteenth, density) {
    const config = this.getConfig();
    const { follow, scaleMask } = this.engine;
    const steps = follow?.masks.length ?? 0;
    const step = steps ? ((sixteenth % steps) + steps) % steps : 0;
    const mask = (steps ? follow.masks[step] & scaleMask : 0) || scaleMask;
    const { low, high } = this.register;
    const phrase = this.engine.config.follow?.phrases?.[config.follow?.phrase] ?? UNISON;
    const every = config.density?.ornamentEvery ?? 0;
    const ornament = every > 0 && density > 0.75 && this.played % every === every - 1 ? 2 : 0;
    const anchor = config.follow?.mode === "echo" && steps ? indexInRange(mask, low, high, fold(follow.echo[step], low, high)) : 0;
    const index = anchor + phrase[this.step++ % phrase.length] + ornament;
    let midi = nthInRange(mask, low, high, index);
    if (midi === this.lastMidi && countInRange(mask, low, high) > 1) midi = nthInRange(mask, low, high, index + 1);
    if (midi < 0) midi = low;
    midi = snapToMask(midi, scaleMask);
    this.played++;
    this.lastMidi = midi;
    return midi;
  }

  play(time, sixteenth, intensity, density, pan = null) {
    const config = this.getConfig();
    let midi = this.nextMidi(sixteenth, density);
    if (this.below) midi -= Math.ceil((this.register.high - this.register.low + 1) / 12) * 12;
    const accents = config.accents?.length ? config.accents : UNISON;
    const accent = accents[sixteenth % accents.length];
    const velocity = lerp(config.velocity[0], config.velocity[1], clamp01(intensity)) * (0.55 + 0.45 * accent);
    if (this.panner && pan !== null) this.panner.pan.setValueAtTime(pan, time);
    this.pool.play(midiToFrequency(midi), this.noteSeconds, time, velocity);
    return midi;
  }

  dispose() {
    this.pool.dispose();
    this.filter.dispose();
    this.panner?.dispose();
    this.channel.dispose();
  }
}

/** Vowel formants as [frequency Hz, bandwidth Hz, amplitude] (alto choir). */
const VOWELS = {
  a: [[800, 80, 1], [1150, 90, 0.5], [2900, 120, 0.025]],
  e: [[400, 60, 1], [1600, 80, 0.063], [2700, 120, 0.032]],
  i: [[350, 50, 1], [1700, 100, 0.1], [2700, 120, 0.032]],
  o: [[450, 70, 1], [800, 80, 0.35], [2830, 100, 0.016]],
  u: [[325, 50, 1], [700, 60, 0.25], [2530, 170, 0.035]],
};

/** Parallel band-passes that turn a bright source into a sung vowel. */
class FormantBank {
  constructor(output) {
    this.input = new Tone.Gain(1);
    this.wet = new Tone.Gain(1).connect(output);
    this.dry = new Tone.Gain(0).connect(output);
    this.volume = new Tone.Volume(0).connect(this.wet);
    this.input.connect(this.dry);
    this.bands = VOWELS.a.map(() => {
      const filter = new Tone.Filter({ type: "bandpass", rolloff: -12 });
      const gain = new Tone.Gain(0);
      this.input.chain(filter, gain, this.volume);
      return { filter, gain };
    });
  }

  set({ vowel, shift, width, mix, gain, volume = 0 }, seconds = 0.3) {
    const formants = VOWELS[vowel] ?? VOWELS.a;
    const makeup = Tone.dbToGain(gain);
    formants.forEach(([frequency, bandwidth, amplitude], i) => {
      const { filter, gain: level } = this.bands[i];
      const shifted = frequency * shift;
      filter.frequency.rampTo(shifted, seconds);
      filter.Q.rampTo(shifted / (bandwidth * width), seconds);
      level.gain.rampTo(amplitude * makeup, seconds);
    });
    this.volume.volume.rampTo(volume, seconds);
    this.wet.gain.rampTo(mix, seconds);
    this.dry.gain.rampTo(1 - mix, seconds);
  }
}

/** A sample looped on the transport grid: starts at the current phase and fades in/out. */
class LoopPlayer {
  constructor(engine, name) {
    this.engine = engine;
    this.name = name;
    this.channel = new Channel(engine);
    this.player = new Tone.Player({ loop: true, fadeOut: 0.01 }).connect(this.channel.input);
    this.url = null;
    this.loaded = false;
    this.active = false;
    this._stopTimer = 0;
  }

  /** @returns {import('./config.js').LoopSample} */
  get config() {
    return this.engine.config.loops[this.name];
  }

  get rate() {
    return this.engine.config.transport.bpm / this.config.bpm;
  }

  /** Loop length in buffer seconds, at the tempo the sample was recorded at. */
  get loopSeconds() {
    return (this.config.bars * this.engine.config.transport.timeSignature[0] * 60) / this.config.bpm;
  }

  apply() {
    const config = this.config;
    if (config.url !== this.url) this.load(config.url);
    this.channel.set({ volume: config.volume, dry: 1, reverbSend: config.reverbSend ?? 0 });
    this.player.playbackRate = this.rate;
  }

  async load(url) {
    this.url = url;
    this.loaded = false;
    try {
      const buffer = await Tone.ToneAudioBuffer.fromUrl(resolvePublicPath(url));
      if (this.url !== url) return;
      if (this.player.state === "started") this.player.stop();
      this.player.buffer = buffer;
      this.loaded = true;
      this._update();
    } catch {
      console.info(`[audio] no loop sample at public/${url}`);
    }
  }

  setActive(active) {
    if (active === this.active) return;
    this.active = active;
    this._update();
  }

  _update() {
    if (!this.loaded) return;
    clearTimeout(this._stopTimer);
    const config = this.config;
    if (this.active) {
      if (this.player.state !== "started") this._start();
      this.channel.fade(1, config.fadeIn);
    } else if (this.player.state === "started") {
      this.channel.fade(0, config.fadeOut);
      this._stopTimer = setTimeout(() => this.player.stop(), (config.fadeOut + 0.1) * 1000);
    }
  }

  _offset(time) {
    const { transport } = this.engine;
    const loopTicks = this.config.bars * this.engine.config.transport.timeSignature[0] * transport.PPQ;
    return ((transport.getTicksAtTime(time) % loopTicks) / loopTicks) * this.loopSeconds;
  }

  _start() {
    const time = Tone.now();
    this.player.loopStart = 0;
    this.player.loopEnd = Math.min(this.loopSeconds, this.player.buffer.duration);
    this.player.playbackRate = this.rate;
    this.player.start(time, this._offset(time));
  }

  /** Re-aligns to the transport, e.g. after the tab was hidden. */
  resync() {
    if (this.player.state !== "started") return;
    const time = Tone.now();
    this.player.restart(time, this._offset(time));
  }

  dispose() {
    clearTimeout(this._stopTimer);
    this.player.dispose();
    this.channel.dispose();
  }
}

/** Named one-shot samples; files that fail to load are skipped. */
class OneShots {
  constructor(engine, output) {
    this.engine = engine;
    this.output = output;
    this.shots = new Map();
  }

  apply() {
    for (const [name, config] of Object.entries(this.engine.config.oneShots ?? {})) {
      let shot = this.shots.get(name);
      if (!shot) {
        shot = { player: new Tone.Player({ fadeOut: 0.02 }).connect(this.output), url: null, loaded: false, last: -Infinity };
        this.shots.set(name, shot);
      }
      shot.player.volume.value = config.volume;
      if (shot.url !== config.url) this._load(shot, config.url);
    }
  }

  async _load(shot, url) {
    shot.url = url;
    shot.loaded = false;
    try {
      const buffer = await Tone.ToneAudioBuffer.fromUrl(resolvePublicPath(url));
      if (shot.url !== url) return;
      shot.player.buffer = buffer;
      shot.loaded = true;
    } catch {
      console.info(`[audio] no one-shot at public/${url}`);
    }
  }

  play(name) {
    const shot = this.shots.get(name);
    const config = this.engine.config.oneShots?.[name];
    if (!shot?.loaded || !config) return;
    const now = performance.now();
    if (now - shot.last < (config.throttleMs ?? 0)) return;
    shot.last = now;
    shot.player.start(Tone.immediate());
  }

  dispose() {
    for (const shot of this.shots.values()) shot.player.dispose();
    this.shots.clear();
  }
}

/**
 * `strength` pulls a note from the next grid slot towards now (0 = immediate,
 * 1 = on the grid). Notes keep a minimum gap of half a slot (strength 0) to a
 * full slot (strength 1); faster bursts are pushed by that gap, at most
 * `maxPushSlots` gaps ahead of now, or dropped. Never stacked.
 */
class Quantizer {
  constructor() {
    this.lastPlay = 0;
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

  /** @returns {{ time: number, sixteenth: number } | null} audio time and 16th index for accents */
  slot(transport, quantize, strength) {
    strength = clamp01(strength);
    const unitSeconds = Tone.Time(quantize.grid).toSeconds();
    const gap = unitSeconds * (0.5 + 0.5 * strength);
    const now = Tone.immediate();
    const next = transport.nextSubdivision(quantize.grid);
    let time = Math.max(now, now + (next - now) * strength);
    const earliest = this.lastPlay + gap;
    if (time < earliest - 1e-3) {
      if (quantize.collision !== "push" || earliest - now > quantize.maxPushSlots * gap) return null;
      time = earliest;
    }
    this.lastPlay = time;
    return { time, sixteenth: Math.round(transport.getTicksAtTime(time) / (transport.PPQ / 4)) };
  }
}

export class AudioEngine extends EventTarget {
  /** @param {MusicConfig} config */
  constructor(config) {
    super();
    this.config = config;
    this.baseline = structuredClone(config);
    this.scene = null;
    this.previewPage = false;
    this.muted = localStorage.getItem(MUTE_KEY) === "1";
    this._externalPlayback = new Set();
    this.started = false;
    this.ready = false;
    this.hidden = false;
    this.state = { notes: "-", scene: "-", voices: "", context: "-" };
    /** @type {Record<string, import('./midi.js').MidiFile | null>} */
    this.midiFiles = {};
    /** @type {Record<string, MidiPart | null>} */
    this.parts = {};
    this.follow = null;
    this.scaleMask = maskOf(scalePcs(config.key));
    this.tickSeconds = 0;
    this.loops = {};
    this._pending = [];
    this._signatures = {};
    this._lastClick = 0;
    this._suspendTimer = 0;
    this._armed = false;
    this.quantizers = { meadow: new Quantizer(), cube: new Quantizer(), ice: new Quantizer() };

    this._onGesture = () => {
      if (!document.body.classList.contains("is-loading")) this.start().catch(console.warn);
    };
    this._onVisibility = () => this._setHidden(document.hidden);
    this._onKey = (event) => {
      if (event.code !== "KeyM" || event.repeat || event.metaKey || event.ctrlKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]")) return;
      this.setMuted(!this.muted);
    };
    this._arm();
    window.addEventListener("keydown", this._onKey);
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  /** Loads Tone and the MIDI files; touches no AudioContext. */
  async prepare() {
    Tone ??= await import("tone");
    this._partsLoading ??= this._loadParts();
  }

  async _loadParts() {
    this._changed("midi", this.config.midi);
    const entries = await Promise.all(MIDI_PARTS.map(async (name) => {
      const url = this.config.midi?.[name];
      if (!url) return [name, null];
      try {
        const response = await fetch(resolvePublicPath(url));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return [name, parseMidi(await response.arrayBuffer())];
      } catch (error) {
        console.warn(`[audio] could not load public/${url}`, error);
        return [name, null];
      }
    }));
    this.midiFiles = Object.fromEntries(entries);
    if (this._built) this._schedule();
  }

  _arm() {
    if (this._armed) return;
    this._armed = true;
    for (const type of GESTURES) window.addEventListener(type, this._onGesture, { capture: true, passive: true });
  }

  _disarm() {
    if (!this._armed) return;
    this._armed = false;
    for (const type of GESTURES) window.removeEventListener(type, this._onGesture, { capture: true });
  }

  /**
   * Call from a user gesture; safe to repeat. The context is created and
   * resumed synchronously here, the graph is built once it reports running.
   */
  start() {
    if (!Tone) return this.prepare().then(() => this.start());
    if (navigator.userActivation && !navigator.userActivation.isActive) return this._startPromise ?? Promise.resolve();
    this.started = true;
    if (!this.effectivelyMuted) enablePlaybackSession();
    if (!this._context) {
      this._context = new Tone.Context({ latencyHint: "playback", lookAhead: LOOK_AHEAD });
      Tone.setContext(this._context);
      this._context.on("statechange", () => this._onContextState());
    }
    if (this._context.state !== "running") this._context.resume().catch(() => {});
    this._onContextState();
    return this._startPromise ?? Promise.resolve();
  }

  _onContextState() {
    if (this._context.state === "running") {
      this._disarm();
      this._startPromise ??= this._boot().catch((error) => {
        this._startPromise = null;
        this._arm();
        throw error;
      });
    } else if (!this.hidden) {
      // Suspended or interrupted by the system: the next gesture resumes it.
      this._arm();
    }
    this._notifyState();
  }

  async _boot() {
    if (!this._built) await this._build();
    await this.reverb.ready;
    await this._partsLoading;
    if (!this.pad.part) this._schedule();
    this._applySamples();
    if (this.transport.state !== "started") this.transport.start("+0.05");
    this._applyScene(0);
    if (document.hidden) this._setHidden(true);
    this.ready = true;
    this._notifyState();
    for (const [scene, event, count] of this._pending.splice(0)) this.trigger(scene, event, count);
  }

  // Yields between groups so the gesture never blocks a frame.
  async _build() {
    const pause = () => globalThis.scheduler?.yield?.() ?? new Promise((resolve) => setTimeout(resolve));
    const config = this.config;
    this.transport = Tone.getTransport();
    this._applyTransport();
    this.master = new Tone.Gain(0).toDestination();
    this.limiter = new Tone.Limiter(config.master.limiter).connect(this.master);
    this.musicBus = new Tone.Gain(1).connect(this.limiter);
    this.sfxBus = new Tone.Volume(config.sfx.volume).connect(this.limiter);

    this.reverb = new Tone.Reverb({ decay: config.reverb.decay, preDelay: config.reverb.preDelay, wet: 1 }).connect(this.musicBus);
    this._changed("reverb", config.reverb);
    this.echoes = {
      meadow: new Echo(this.musicBus, this.reverb),
      cube: new Echo(this.musicBus, this.reverb),
      ice: new Echo(this.musicBus, this.reverb),
      arp: new Echo(this.musicBus, this.reverb),
    };
    await pause();

    const padChannel = new Channel(this);
    padChannel.fade(1, 0);
    this.padFilter = new Tone.Filter({ type: "lowpass", rolloff: -12 }).connect(padChannel.input);
    this.padLfo = new Tone.LFO({ type: "sine" }).connect(this.padFilter.frequency).start();
    this.padChorus = new Tone.Chorus({ spread: 180 }).connect(this.padFilter).start();
    this.formants = config.pad.voice.bypass ? null : new FormantBank(this.padChorus);
    this.padVibrato = new Tone.Vibrato({ maxDelay: 0.01 }).connect(this.formants?.input ?? this.padChorus);
    this.padDetuneLfo = new Tone.LFO({ type: "sine" }).start();
    this.pad = new MidiTrack(this, () => this.config.pad, padChannel, {
      output: this.padVibrato,
      onCreate: (synth) => this.padDetuneLfo.connect(synth.detune),
    });
    this.pad.onNote = (event) => { this.state.notes = event.label; };
    this.arp = new MidiTrack(this, () => this.config.arp, new Channel(this, this.echoes.arp), { filter: true });
    this.bass = new MidiTrack(this, () => this.config.bass, new Channel(this), { filter: true });
    this._applyPad();
    this.arp.apply();
    this.bass.apply();
    await pause();

    const layers = {
      meadow: [() => this.config.scenes.meadow, { echo: this.echoes.meadow }],
      cube: [() => this.config.scenes.cube, { echo: this.echoes.cube }],
      iceFloor: [() => this.config.scenes.ice.wall, { pan: true, echo: this.echoes.ice, below: true }],
      iceWall: [() => this.config.scenes.ice.wall, { pan: true, echo: this.echoes.ice }],
    };
    for (const [name, [getConfig, options]] of Object.entries(layers)) {
      layers[name] = new Layer(this, getConfig, options);
      layers[name].apply();
      await pause();
    }
    this.layers = layers;

    this.clickFilter = new Tone.Filter({ type: "bandpass" }).connect(this.sfxBus);
    this.click = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.012, sustain: 0, release: 0.004 } }).connect(this.clickFilter);
    this.oneShots = new OneShots(this, this.limiter);
    this._built = true;
    this._applyMix();
  }

  /** @param {MusicConfig} config */
  applyConfig(config) {
    this.config = config;
    this.scaleMask = maskOf(scalePcs(config.key));
    if (!this._built) return;
    this._applyTransport();
    this._applyPad();
    this.arp.apply();
    this.bass.apply();
    for (const layer of Object.values(this.layers)) layer.apply();
    if (this._changed("midi", config.midi)) this._partsLoading = this._loadParts();
    this._applyMix();
  }

  _applyTransport() {
    const { transport } = this.config;
    this.transport.bpm.value = transport.bpm;
    this.transport.timeSignature = transport.timeSignature[0];
    this.tickSeconds = 60 / (transport.bpm * this.transport.PPQ);
    for (const loop of Object.values(this.loops)) loop.player.playbackRate = loop.rate;
  }

  _applyMix() {
    const config = this.config;
    const { reverb, scenes, sfx, master } = config;
    this.scaleMask = maskOf(scalePcs(config.key));
    this.limiter.threshold.value = master.limiter;
    this.master.gain.rampTo(this._masterGain(), 0.1);

    if (this._changed("reverb", reverb)) {
      this.reverb.decay = reverb.decay;
      this.reverb.preDelay = reverb.preDelay;
    }
    this.echoes.meadow.set(scenes.meadow.delay);
    this.echoes.cube.set(scenes.cube.delay);
    this.echoes.ice.set(scenes.ice.delay);
    this.echoes.arp.set(config.arp.delay);

    this.sfxBus.volume.rampTo(sfx.volume, 0.05);
    this.click.noise.type = sfx.noise;
    this.clickFilter.type = sfx.filter;
    this.clickFilter.Q.value = sfx.Q;
    this.click.envelope.set({ attack: sfx.attack, decay: sfx.decay, sustain: sfx.sustain, release: sfx.release });

    if (this._changed("follow", [config.follow?.window, config.transport.timeSignature])) this._buildFollow();
    if (this.ready) this._applySamples();
    this._applyScene(0.1);
  }

  _applySamples() {
    for (const name of Object.keys(this.config.loops ?? {})) {
      this.loops[name] ??= new LoopPlayer(this, name);
      this.loops[name].apply();
    }
    for (const [name, loop] of Object.entries(this.loops)) {
      if (this.config.loops?.[name]) continue;
      loop.dispose();
      delete this.loops[name];
    }
    this.oneShots.apply();
  }

  _changed(name, value) {
    const signature = JSON.stringify(value);
    if (this._signatures[name] === signature) return false;
    this._signatures[name] = signature;
    return true;
  }

  _applyPad() {
    const { pad } = this.config;
    const part = this.parts.pad;
    let shortest = Infinity;
    for (const note of part?.notes ?? []) shortest = Math.min(shortest, note.duration * this.tickSeconds);
    const envelope = { ...pad.envelope, release: Math.min(pad.envelope.release, shortest * 0.8) };
    const synth = pad.synth;
    this.pad.pool.configure({
      type: synth.type,
      oscillator: pad.oscillator,
      modulation: synth.modulation,
      harmonicity: synth.harmonicity,
      modulationIndex: synth.modulationIndex,
      envelope,
      modulationEnvelope: synth.modulationEnvelope,
    }, (part?.polyphony ?? 4) * 2 + 2);
    this.pad.channel.set(pad);
    this.padFilter.Q.value = pad.filter.Q;
    this.padLfo.set({ frequency: pad.lfo.rate, min: pad.lfo.min, max: pad.lfo.max });
    this.formants?.set(pad.voice);
    this.padVibrato.set({ frequency: pad.vibrato.rate, depth: pad.vibrato.depth });
    this.padChorus.set({ frequency: pad.chorus.rate, depth: pad.chorus.depth, wet: pad.chorus.wet });
    this.padDetuneLfo.set({ frequency: pad.detuneLfo.rate, min: -pad.detuneLfo.depth, max: pad.detuneLfo.depth });
  }

  /** (Re)builds the looping parts from the loaded MIDI files. */
  _schedule() {
    const beats = this.config.transport.timeSignature[0];
    for (const name of MIDI_PARTS) {
      const file = this.midiFiles[name];
      this.parts[name] = file ? toPart(file, this.transport.PPQ, beats) : null;
    }
    if (import.meta.env.DEV) this._warnOutOfKey();
    this._applyPad();
    this.pad.schedule(this.parts.pad);
    this.arp.schedule(this.parts.arp);
    this.bass.schedule(this.parts.bass);
    this._buildFollow();
  }

  _warnOutOfKey() {
    const { tonic, mode } = this.config.key;
    for (const name of MIDI_PARTS) {
      const notes = outOfKey(this.parts[name]?.notes ?? [], this.scaleMask);
      if (!notes.length) continue;
      const names = [...new Set(notes.map((note) => midiToNote(note.midi)))].join(" ");
      console.warn(`[audio] ${this.config.midi[name]} has notes outside ${tonic} ${mode}: ${names}`);
    }
  }

  _buildFollow() {
    const arp = this.parts.arp;
    if (!arp || !this.transport) {
      this.follow = null;
      return;
    }
    this.follow = buildFollowPools(arp.notes, {
      loopTicks: arp.loopTicks,
      stepTicks: this.transport.PPQ / 4,
      windowTicks: Tone.Time(this.config.follow?.window ?? "4n").toTicks(),
    });
  }

  /** Scene that decides what plays; the debug preview stands in for a project page. */
  get activeScene() {
    return this.previewPage ? "project" : this.scene;
  }

  get pageMode() {
    return PAGE_SCENES.has(this.activeScene);
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
    const scene = this.activeScene;
    const page = this.pageMode;
    const target = (name) => (!page && scene === name ? 1 : 0);
    this.layers.meadow.channel.fade(target("meadow"), fade);
    this.layers.cube.channel.fade(target("cube"), fade);
    this.layers.iceFloor.channel.fade(target("ice"), fade);
    this.layers.iceWall.channel.fade(target("ice"), fade);
    const { arp, bass, loops } = this.config;
    this.arp.channel.fade(page ? arp.pageLevel : arp.homeLevel, fade);
    this.bass.channel.fade(bass.scenes?.includes(scene) ? 1 : 0, fade);
    for (const [name, loop] of Object.entries(this.loops)) loop.setActive(loops[name]?.scenes?.includes(scene) ?? false);
  }

  trigger(scene, event, count = 1) {
    if (!this.ready) {
      if (this.started && scene !== "ui" && this._pending.length < 4) this._pending.push([scene, event, count]);
      return;
    }
    if (this.hidden) return;
    if (scene === "ui") {
      if (event.type === "tileHover") this.playClick();
      else this.oneShots.play(event.type);
      return;
    }
    if (this.pageMode || scene !== this.scene || this.transport.state !== "started") return;
    const quantizer = this.quantizers[scene];
    const now = Tone.now();
    quantizer.observe(now, count);

    if (scene === "ice") {
      const ice = this.config.scenes.ice;
      const pan = Math.max(-1, Math.min(1, (event.position?.x ?? 0) / ice.panWidth)) * ice.panAmount;
      const slot = this._slot(this.layers.iceWall, quantizer, 0.8);
      const surface = event.surface ?? "floor";
      if (slot && surface !== "floor") this._playAt(this.layers.iceWall, slot, pan);
      if (slot && surface !== "wall") this._playAt(this.layers.iceFloor, slot, pan);
      return;
    }
    const slot = this._slot(this.layers[scene], quantizer, event.intensity ?? 0.5);
    if (slot) this._playAt(this.layers[scene], slot, null);
  }

  _slot(layer, quantizer, intensity) {
    const config = layer.getConfig();
    const density = quantizer.density(config.density);
    const slot = quantizer.slot(this.transport, this.config.quantize, config.quantizeStrength ?? 1);
    return slot && { ...slot, density, level: Math.max(intensity, density) };
  }

  _playAt(layer, slot, pan) {
    layer.play(slot.time, slot.sixteenth, slot.level, slot.density, pan);
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
    return this.effectivelyMuted || this.hidden ? 0 : Tone.dbToGain(this.config.master.volume);
  }

  get effectivelyMuted() { return this.muted || this._externalPlayback.size > 0; }

  setExternalPlayback(source, playing) {
    if (playing) this._externalPlayback.add(source);
    else this._externalPlayback.delete(source);
    this.master?.gain.rampTo(this._masterGain(), playing ? 0.1 : 0.4);
    if (this.ready && !this.effectivelyMuted && !this.hidden) {
      enablePlaybackSession();
      this._context.resume().catch(console.warn);
    }
    this._notifyState();
  }

  get playing() {
    return this.ready && !this.effectivelyMuted && !this.hidden && this._context?.state === "running";
  }

  _notifyState() {
    this.dispatchEvent(new Event("statechange"));
  }

  setMuted(muted) {
    const changed = muted !== this.muted;
    this.muted = muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    if (this.started && changed && !this._externalPlayback.size) {
      if (muted) releasePlaybackSession();
      else enablePlaybackSession();
    }
    this.master?.gain.rampTo(this._masterGain(), 0.2);
    this._notifyState();
  }

  _setHidden(hidden) {
    this.hidden = hidden;
    this._notifyState();
    if (this.started && !this.effectivelyMuted) {
      if (hidden) releasePlaybackSession();
      else enablePlaybackSession();
    }
    if (!this._built) return;
    clearTimeout(this._suspendTimer);
    const context = this._context;
    if (hidden) {
      this.master.gain.rampTo(0, 0.15);
      this._suspendTimer = setTimeout(() => {
        this.transport.pause();
        context.rawContext.suspend();
      }, 250);
    } else {
      // Some browsers only resume from a gesture; resuming here disarms again.
      this._arm();
      context.resume().then(() => {
        if (this.hidden) return;
        if (this.transport.state !== "started") this.transport.start("+0.05");
        for (const loop of Object.values(this.loops)) loop.resync();
        this.master.gain.rampTo(this._masterGain(), 0.4);
      }).catch(() => {});
    }
  }

  voiceCounts() {
    if (!this.layers) return "";
    const layers = Object.entries(this.layers).map(([name, layer]) => `${name} ${layer.pool.active}`);
    return `pad ${this.pad.pool.active} · arp ${this.arp.pool.active} · bass ${this.bass.pool.active} · ${layers.join(" · ")}`;
  }

  contextInfo() {
    const raw = this._context?.rawContext;
    if (!raw) return "not started";
    const ms = (value) => (value ? `${Math.round(value * 1000)}ms` : "-");
    return `${raw.state} · base ${ms(raw.baseLatency)} · out ${ms(raw.outputLatency)}`;
  }

  /**
   * Debug: simulates a fast gesture (one event every `interval` ms) so the
   * quantizer, push/drop and density can be heard. Switches the audio scene.
   * @param {'meadow'|'cube'|'ice'} target
   */
  burst(target, count = 24, interval = 35) {
    const ice = target === "ice";
    this.scene = ice ? "ice" : target;
    this.state.scene = this.scene;
    this.previewPage = false;
    this._applyScene(0.05);
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (ice) {
          this.trigger("ice", { type: "surfaceClick", surface: "both", position: { x: (Math.random() - 0.5) * 40, y: 0, z: 0 } });
        } else if (target === "cube") {
          this.trigger("cube", { type: "cubeHover", id: i, intensity: 0.8 });
        } else {
          this.trigger("meadow", { type: "flowerSpawn", intensity: 0.8 });
        }
      }, i * interval);
    }
  }

  /** Full music.overrides.js source (active reference) with live edits merged in, or null when nothing changed. */
  overridesFile() {
    const diff = diffConfig(this.baseline, this.config);
    if (!diff) return null;
    return { content: renderOverrides(deepMerge(currentOverrides, diff)), count: countLeaves(diff) };
  }
}

let currentGenerated = generated;
let currentSong = song;
let currentOverrides = overrides;
/** @type {AudioEngine | null} */
let engine = null;

const buildConfig = () => mergeConfig(currentGenerated, currentSong, currentOverrides, isMobileOrTablet());

/**
 * Main thread only. Scene code talks to it through `audio` (./audio.js) via
 * the dispatcher, which also bridges events from the offscreen worker.
 * @param {import('@/shared/dispatcher').default} dispatcher
 */
export function initAudio(dispatcher) {
  if (engine) return engine;
  engine = new AudioEngine(buildConfig());
  dispatcher.on(AUDIO_EVENT, (message) => engine.handle(message));
  dispatcher.on(AUDIO_SCENE_EVENT, ({ scene }) => engine.setScene(scene));
  if (dispatcher.data[AUDIO_SCENE_EVENT]) engine.setScene(dispatcher.data[AUDIO_SCENE_EVENT].scene);

  if (getFlag("debugAudio")) import("./AudioDebug.js").then(({ createAudioDebug }) => createAudioDebug(engine));
  return engine;
}

if (import.meta.hot) {
  import.meta.hot.accept("./music.js", (next) => {
    if (!next) return;
    currentGenerated = next.generated;
    currentSong = next.song;
    currentOverrides = next.overrides;
    if (!engine) return;
    // In place, so debug controls bound to config objects stay live.
    assignDeep(engine.config, buildConfig());
    engine.baseline = structuredClone(engine.config);
    engine.applyConfig(engine.config);
  });
}
