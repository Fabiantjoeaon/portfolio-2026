import { createDebugPanel } from "@/offscreen/debug/createDebugPanel";
import { attachSaveParamsButton, registerSaveSource } from "@/offscreen/debug/saveParams";

const GRIDS = ["32n", "16n", "8n", "8n.", "4n"];
const LENGTHS = ["32n", "16n", "8n", "8n.", "4n", "2n"];
const DELAY_TIMES = ["16n", "8n", "8n.", "8t", "4n", "4n.", "2n"];
const WINDOWS = ["16n", "8n", "4n", "2n", "1m"];
const WAVES = ["sine", "triangle", "square", "sawtooth", "fatsine", "fatsquare", "fatsawtooth"];
const FILTERS = ["lowpass", "highpass", "bandpass"];
const ROLLOFFS = [-12, -24, -48, -96];
const SYNTH_TYPES = ["fm", "am", "synth"];
const NOTE = /^[A-G][#b]?-?\d$/;
const SHORT_ENVELOPE = { attack: 1, decay: 3, release: 4 };
const MOD_ENVELOPE = { attack: 2, decay: 3, release: 4 };
const PAD_ENVELOPE = { attack: 12, decay: 12, release: 15 };

/**
 * Audio panel (?debugAudio). Controls write straight into `engine.config`
 * (the live merged config) and re-apply it; "Save to params.js" writes the
 * diff into music.overrides.js.
 * @param {import('./AudioEngine.js').AudioEngine} engine
 */
export function createAudioDebug(engine) {
  const root = createDebugPanel("debugAudio");
  attachSaveParamsButton(root);
  const config = engine.config;
  const apply = () => engine.applyConfig(engine.config);

  const slider = (folder, object, key, min, max, step, name) =>
    folder.add(object, key, min, max, step).name(name).onChange(apply);
  const select = (folder, object, key, options, name) =>
    folder.add(object, key, options).name(name).onChange(apply);
  const button = (folder, name, fn) => folder.add({ [name]: fn }, name);
  // Keys that may be absent from the config: only written (and saved) once edited.
  const optional = (object, key, fallback) => ({
    get value() { return object[key] ?? fallback; },
    set value(next) { object[key] = next; },
  });
  const noteField = (folder, object, key, name) => {
    let last = object[key];
    const controller = folder.add(object, key).name(name).onFinishChange((value) => {
      if (!NOTE.test(value)) {
        object[key] = last;
        controller.updateDisplay();
        return;
      }
      last = value;
      apply();
    });
  };

  const global = root.addFolder("Global");
  const toggles = {
    get muted() { return engine.muted; },
    set muted(value) { engine.setMuted(value); },
    previewPage: false,
  };
  slider(global, config.master, "volume", -40, 6, 0.5, "Master (dB)");
  global.add(toggles, "muted").name("Mute (M)").listen();
  slider(global, config.transport, "bpm", 40, 200, 0.5, "BPM");
  select(global, config.quantize, "grid", GRIDS, "Grid");
  select(global, config.quantize, "collision", ["push", "drop"], "Collision");
  slider(global, config.quantize, "maxPushSlots", 0, 4, 1, "Max Push Slots");
  slider(global, config.master, "sceneFade", 0, 5, 0.1, "Scene Fade (s)");
  global.add(engine.state, "notes").name("Pad Notes").listen();
  global.add(engine.state, "scene").name("Scene").listen();
  global.add(engine.state, "voices").name("Voices").listen();
  global.add(engine.state, "context").name("Context").listen();
  registerSaveSource("audioOverrides", () => engine.overridesFile());

  const page = root.addFolder("Project Page");
  page.add(toggles, "previewPage").name("Preview").onChange((value) => {
    engine.previewPage = value;
    apply();
  });

  const envelopeControls = (folder, envelope, name, max) => {
    const group = folder.addFolder(name);
    slider(group, envelope, "attack", 0.001, max.attack, 0.001, "Attack");
    slider(group, envelope, "decay", 0.01, max.decay, 0.01, "Decay");
    slider(group, envelope, "sustain", 0, 1, 0.01, "Sustain");
    slider(group, envelope, "release", 0.01, max.release, 0.01, "Release");
  };

  /** Pad keeps its oscillator ({ type, count, spread }) and envelope outside `synth`. */
  const synthControls = (folder, synth, { oscillator = null, envelope = synth.envelope, envelopeMax = SHORT_ENVELOPE } = {}) => {
    const group = folder.addFolder("Synth");
    select(group, synth, "type", SYNTH_TYPES, "Type");
    if (oscillator) {
      select(group, oscillator, "type", WAVES, "Oscillator");
      slider(group, oscillator, "count", 1, 8, 1, "Fat Count");
      slider(group, oscillator, "spread", 0, 100, 1, "Fat Spread (ct)");
    } else {
      select(group, synth, "oscillator", WAVES, "Oscillator");
      slider(group, optional(synth, "count", 3), "value", 1, 8, 1, "Fat Count");
      slider(group, optional(synth, "spread", 20), "value", 0, 100, 1, "Fat Spread (ct)");
    }
    select(group, optional(synth, "modulation", "sine"), "value", WAVES, "Modulator");
    slider(group, optional(synth, "harmonicity", 1), "value", 0.1, 16, 0.01, "Harmonicity");
    slider(group, optional(synth, "modulationIndex", 4), "value", 0, 40, 0.1, "Mod Index (fm)");
    slider(group, optional(synth, "detune", 0), "value", -1200, 1200, 1, "Detune (ct)");
    slider(group, optional(synth, "portamento", 0), "value", 0, 0.5, 0.005, "Portamento (s)");
    envelopeControls(group, envelope, "Amp Envelope", envelopeMax);
    if (synth.modulationEnvelope) envelopeControls(group, synth.modulationEnvelope, "Mod Envelope (fm/am)", MOD_ENVELOPE);
  };

  const filterControls = (folder, filter, { frequency = true } = {}) => {
    const group = folder.addFolder("Filter");
    select(group, optional(filter, "type", "lowpass"), "value", FILTERS, "Type");
    if (frequency) slider(group, filter, "frequency", 20, 20000, 10, "Frequency");
    slider(group, filter, "Q", 0.1, 20, 0.1, "Q");
    select(group, optional(filter, "rolloff", -12), "value", ROLLOFFS, "Rolloff");
    return group;
  };

  const pad = root.addFolder("Pad");
  slider(pad, config.pad, "volume", -40, 0, 0.5, "Volume (dB)");
  slider(pad, config.pad, "dry", 0, 1, 0.01, "Dry");
  slider(pad, config.pad, "reverbSend", 0, 1.5, 0.01, "Reverb Send");
  slider(pad, config.pad, "velocity", 0.05, 1, 0.01, "Velocity");
  synthControls(pad, config.pad.synth, { oscillator: config.pad.oscillator, envelope: config.pad.envelope, envelopeMax: PAD_ENVELOPE });
  const padFilter = filterControls(pad, config.pad.filter, { frequency: false });
  slider(padFilter, config.pad.lfo, "min", 80, 4000, 10, "Cutoff Min");
  slider(padFilter, config.pad.lfo, "max", 200, 8000, 10, "Cutoff Max");
  slider(padFilter, config.pad.lfo, "rate", 0.005, 0.5, 0.005, "Cutoff LFO Rate");
  slider(pad, config.pad.detuneLfo, "depth", 0, 30, 0.5, "Detune LFO Depth (ct)");
  slider(pad, config.pad.detuneLfo, "rate", 0.01, 1, 0.01, "Detune LFO Rate");
  slider(pad, config.reverb, "decay", 1, 20, 0.5, "Reverb Decay");
  if (!config.pad.voice.bypass) {
    const choir = pad.addFolder("Choir");
    slider(choir, config.pad.voice, "volume", -40, 12, 0.5, "Volume (dB)");
    select(choir, config.pad.voice, "vowel", ["a", "e", "i", "o", "u"], "Vowel");
    slider(choir, config.pad.voice, "shift", 0.6, 1.6, 0.01, "Formant Shift");
    slider(choir, config.pad.voice, "width", 0.3, 4, 0.05, "Formant Width");
    slider(choir, config.pad.voice, "mix", 0, 1, 0.01, "Formant Mix");
    slider(choir, config.pad.voice, "gain", 0, 30, 0.5, "Formant Gain (dB)");
    slider(choir, config.pad.vibrato, "rate", 0.5, 8, 0.1, "Vibrato Rate");
    slider(choir, config.pad.vibrato, "depth", 0, 0.3, 0.005, "Vibrato Depth");
    slider(choir, config.pad.chorus, "rate", 0.05, 4, 0.05, "Ensemble Rate");
    slider(choir, config.pad.chorus, "depth", 0, 1, 0.01, "Ensemble Depth");
    slider(choir, config.pad.chorus, "wet", 0, 1, 0.01, "Ensemble Wet");
  }

  const trackControls = (folder, track) => {
    slider(folder, track, "volume", -40, 6, 0.5, "Volume (dB)");
    slider(folder, track, "octave", -2, 2, 1, "Octave");
    slider(folder, track, "velocity", 0.05, 1.5, 0.01, "Velocity");
    slider(folder, track, "gate", 0.05, 2, 0.01, "Gate");
    slider(folder, track, "voices", 1, 8, 1, "Voice Limit");
    slider(folder, track, "dry", 0, 1, 0.01, "Dry");
    slider(folder, track, "reverbSend", 0, 1.5, 0.01, "Reverb Send");
  };

  const arp = root.addFolder("Arp");
  slider(arp, config.arp, "homeLevel", 0, 1.5, 0.01, "Home Level");
  slider(arp, config.arp, "pageLevel", 0, 1.5, 0.01, "Page Level");
  trackControls(arp, config.arp);
  slider(arp, config.arp, "delaySend", 0, 1, 0.01, "Delay Send");
  synthControls(arp, config.arp.synth);
  filterControls(arp, config.arp.filter);
  const arpDelay = arp.addFolder("Delay");
  select(arpDelay, config.arp.delay, "time", DELAY_TIMES, "Time");
  slider(arpDelay, config.arp.delay, "feedback", 0, 0.9, 0.01, "Feedback");
  slider(arpDelay, config.arp.delay, "filter", 200, 10000, 10, "Filter");

  const follow = root.addFolder("Follow Arp");
  select(follow, config.follow, "window", WINDOWS, "Pool Window");

  const phrases = Object.keys(config.follow.phrases);
  const voiceControls = (folder, voice, burstTarget) => {
    slider(folder, voice, "volume", -40, 0, 0.5, "Volume (dB)");
    slider(folder, voice, "quantizeStrength", 0, 1, 0.01, "Quantize Strength");
    slider(folder, voice, "voices", 1, 8, 1, "Voice Limit");
    select(folder, voice.follow, "mode", ["pool", "echo"], "Follow Mode");
    select(folder, voice.follow, "phrase", phrases, "Phrase");
    noteField(folder, voice.register, "low", "Register Low");
    noteField(folder, voice.register, "high", "Register High");
    select(folder, voice, "noteLength", LENGTHS, "Note Length");
    synthControls(folder, voice.synth);
    filterControls(folder, voice.filter);
    if (voice.density) {
      const density = folder.addFolder("Density");
      slider(density, voice.density, "rateLow", 0, 20, 0.1, "Rate Low");
      slider(density, voice.density, "rateHigh", 1, 30, 0.1, "Rate High");
      slider(density, voice.density, "ornamentEvery", 0, 16, 1, "Ornament Every");
    }
    const velocity = {
      get min() { return voice.velocity[0]; },
      set min(value) { voice.velocity[0] = value; },
      get max() { return voice.velocity[1]; },
      set max(value) { voice.velocity[1] = value; },
    };
    slider(folder, velocity, "min", 0, 1, 0.01, "Velocity Min");
    slider(folder, velocity, "max", 0, 1, 0.01, "Velocity Max");
    slider(folder, voice, "dry", 0, 1, 0.01, "Dry");
    slider(folder, voice, "reverbSend", 0, 1.5, 0.01, "Reverb Send");
    if (voice.delaySend !== undefined) slider(folder, voice, "delaySend", 0, 1, 0.01, "Delay Send");
    button(folder, "Test burst", () => engine.burst(burstTarget));
  };

  const delayControls = (folder, delay) => {
    const delayFolder = folder.addFolder("Delay");
    slider(delayFolder, delay, "time", 0.02, 1.5, 0.01, "Time (s)");
    slider(delayFolder, delay, "feedback", 0, 0.9, 0.01, "Feedback");
    slider(delayFolder, delay, "filter", 200, 10000, 10, "Filter");
  };

  const meadow = root.addFolder("Meadow");
  voiceControls(meadow, config.scenes.meadow, "meadow");
  delayControls(meadow, config.scenes.meadow.delay);
  const cube = root.addFolder("Cube");
  voiceControls(cube, config.scenes.cube, "cube");
  delayControls(cube, config.scenes.cube.delay);
  const ice = root.addFolder("Ice");
  delayControls(ice, config.scenes.ice.delay);
  slider(ice, config.scenes.ice, "panAmount", 0, 1, 0.01, "Pan Amount");
  voiceControls(ice, config.scenes.ice.wall, "ice");

  const samples = root.addFolder("Samples");
  for (const [name, loop] of Object.entries(config.loops ?? {})) {
    const folder = samples.addFolder(`Loop: ${name}`);
    slider(folder, loop, "volume", -40, 12, 0.5, "Volume (dB)");
    slider(folder, optional(loop, "offset", 0), "value", -1000, 1000, 1, "Offset (ms, + = later)");
    slider(folder, loop, "reverbSend", 0, 1.5, 0.01, "Reverb Send");
    slider(folder, loop, "fadeIn", 0.01, 8, 0.01, "Fade In (s)");
    slider(folder, loop, "fadeOut", 0.01, 8, 0.01, "Fade Out (s)");
  }
  for (const [name, shot] of Object.entries(config.oneShots ?? {})) {
    const folder = samples.addFolder(`One-shot: ${name}`);
    slider(folder, shot, "volume", -40, 12, 0.5, "Volume (dB)");
    slider(folder, shot, "throttleMs", 0, 1000, 10, "Throttle (ms)");
    button(folder, "Test", () => engine.ready && engine.oneShots.play(name));
  }

  const sfx = root.addFolder("SFX Click");
  select(sfx, config.sfx, "noise", ["white", "pink", "brown"], "Noise");
  select(sfx, config.sfx, "filter", FILTERS, "Filter Type");
  slider(sfx, config.sfx, "frequency", 200, 14000, 10, "Filter Freq");
  slider(sfx, config.sfx, "Q", 0.1, 18, 0.1, "Filter Q");
  slider(sfx, config.sfx, "jitter", 0, 2, 0.01, "Jitter (oct)");
  slider(sfx, config.sfx, "attack", 0.001, 0.05, 0.001, "Attack");
  slider(sfx, config.sfx, "decay", 0.002, 0.2, 0.001, "Decay");
  slider(sfx, config.sfx, "sustain", 0, 1, 0.01, "Sustain");
  slider(sfx, config.sfx, "release", 0.001, 0.2, 0.001, "Release");
  slider(sfx, config.sfx, "volume", -48, 6, 0.5, "Volume (dB)");
  slider(sfx, config.sfx, "throttleMs", 0, 200, 1, "Throttle (ms)");
  button(sfx, "Test click", () => engine.playClick());
  root.foldersRecursive().forEach((folder) => folder.close());
  engine.addEventListener("configchange", () => root.controllersRecursive().forEach((controller) => controller.updateDisplay()));

  setInterval(() => {
    engine.state.voices = engine.voiceCounts();
    engine.state.context = engine.contextInfo();
  }, 250);
}
