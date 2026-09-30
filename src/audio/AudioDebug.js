import { createDebugPanel } from "@/offscreen/debug/createDebugPanel";
import { attachSaveParamsButton, registerSaveSource } from "@/offscreen/debug/saveParams";

const GRIDS = ["32n", "16n", "8n", "8n.", "4n"];
const LENGTHS = ["32n", "16n", "8n", "8n.", "4n", "2n"];
const WAVES = ["sine", "triangle", "square", "sawtooth", "fatsine", "fatsquare", "fatsawtooth"];
const FILTERS = ["lowpass", "highpass", "bandpass"];

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

  const global = root.addFolder("Global");
  const toggles = {
    get muted() { return engine.muted; },
    set muted(value) { engine.setMuted(value); },
    previewPage: false,
  };
  slider(global, config.master, "volume", -40, 6, 0.5, "Master (dB)");
  global.add(toggles, "muted").name("Mute (M)").listen();
  slider(global, config.transport, "bpm", 40, 140, 1, "BPM");
  select(global, config.quantize, "grid", GRIDS, "Grid");
  select(global, config.quantize, "collision", ["push", "drop"], "Collision");
  slider(global, config.quantize, "maxPushSlots", 0, 4, 1, "Max Push Slots");
  slider(global, config.master, "sceneFade", 0, 5, 0.1, "Scene Fade (s)");
  global.add(engine.state, "chord").name("Chord").listen();
  global.add(engine.state, "scene").name("Scene").listen();
  global.add(engine.state, "voices").name("Voices").listen();
  registerSaveSource("audioOverrides", () => engine.overridesFile());

  const synthControls = (folder, synth) => {
    const group = folder.addFolder("Synth");
    const index = {
      get value() { return synth.modulationIndex ?? 4; },
      set value(next) { synth.modulationIndex = next; },
    };
    select(group, synth, "type", ["fm", "am", "synth"], "Type");
    select(group, synth, "oscillator", WAVES, "Oscillator");
    select(group, synth, "modulation", WAVES, "Modulator");
    slider(group, synth, "harmonicity", 0.1, 16, 0.01, "Harmonicity");
    slider(group, index, "value", 0, 40, 0.1, "Mod Index");
    const envelope = group.addFolder("Mod Envelope");
    slider(envelope, synth.modulationEnvelope, "attack", 0.001, 2, 0.001, "Attack");
    slider(envelope, synth.modulationEnvelope, "decay", 0.01, 3, 0.01, "Decay");
    slider(envelope, synth.modulationEnvelope, "sustain", 0, 1, 0.01, "Sustain");
    slider(envelope, synth.modulationEnvelope, "release", 0.01, 4, 0.01, "Release");
  };

  const pad = root.addFolder("Pad");
  slider(pad, config.pad, "volume", -40, 0, 0.5, "Volume (dB)");
  slider(pad, config.pad, "dry", 0, 1, 0.01, "Dry");
  slider(pad, config.pad, "reverbSend", 0, 1.5, 0.01, "Reverb Send");
  slider(pad, config.pad, "velocity", 0.05, 1, 0.01, "Velocity");
  synthControls(pad, {
    get type() { return config.pad.synth.type; },
    set type(value) { config.pad.synth.type = value; },
    get oscillator() { return config.pad.oscillator.type; },
    set oscillator(value) { config.pad.oscillator.type = value; },
    get modulation() { return config.pad.synth.modulation; },
    set modulation(value) { config.pad.synth.modulation = value; },
    get harmonicity() { return config.pad.synth.harmonicity; },
    set harmonicity(value) { config.pad.synth.harmonicity = value; },
    get modulationIndex() { return config.pad.synth.modulationIndex ?? 4; },
    set modulationIndex(value) { config.pad.synth.modulationIndex = value; },
    modulationEnvelope: config.pad.synth.modulationEnvelope,
  });
  slider(pad, config.pad.oscillator, "count", 1, 5, 1, "Fat Count");
  slider(pad, config.pad.oscillator, "spread", 0, 60, 1, "Fat Spread (ct)");
  slider(pad, config.pad.detuneLfo, "depth", 0, 30, 0.5, "Detune Depth (ct)");
  slider(pad, config.pad.detuneLfo, "rate", 0.01, 1, 0.01, "Detune Rate");
  slider(pad, config.pad.lfo, "min", 80, 4000, 10, "Cutoff Min");
  slider(pad, config.pad.lfo, "max", 200, 8000, 10, "Cutoff Max");
  slider(pad, config.pad.lfo, "rate", 0.005, 0.5, 0.005, "Cutoff LFO Rate");
  slider(pad, config.pad.filter, "Q", 0.1, 8, 0.1, "Filter Q");
  slider(pad, config.pad.envelope, "attack", 0.05, 12, 0.05, "Attack");
  slider(pad, config.pad.envelope, "release", 0.2, 15, 0.1, "Release");
  slider(pad, config.reverb, "decay", 1, 20, 0.5, "Reverb Decay");
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

  const patterns = Object.keys(config.patterns);
  const voiceControls = (folder, voice, burstTarget) => {
    slider(folder, voice, "volume", -40, 0, 0.5, "Volume (dB)");
    slider(folder, voice, "quantizeStrength", 0, 1, 0.01, "Quantize Strength");
    slider(folder, voice, "voices", 1, 8, 1, "Voice Limit");
    select(folder, voice, "pattern", patterns, "Pattern");
    slider(folder, voice, "octave", 1, 7, 1, "Octave");
    select(folder, voice, "noteLength", LENGTHS, "Note Length");
    const amp = folder.addFolder("Envelope");
    slider(amp, voice.synth.envelope, "attack", 0.001, 1, 0.001, "Attack");
    slider(amp, voice.synth.envelope, "decay", 0.01, 3, 0.01, "Decay");
    slider(amp, voice.synth.envelope, "sustain", 0, 1, 0.01, "Sustain");
    slider(amp, voice.synth.envelope, "release", 0.01, 4, 0.01, "Release");
    synthControls(folder, voice.synth);
    select(folder, voice.filter, "type", FILTERS, "Filter Type");
    slider(folder, voice.filter, "frequency", 100, 12000, 10, "Filter Freq");
    slider(folder, voice.filter, "Q", 0.1, 10, 0.1, "Filter Q");
    if (voice.density) {
      const density = folder.addFolder("Density");
      slider(density, voice.density, "rateLow", 0, 20, 0.1, "Rate Low");
      slider(density, voice.density, "rateHigh", 1, 30, 0.1, "Rate High");
      slider(density, voice.density, "ornamentEvery", 0, 16, 1, "Ornament Every");
    }
    const velocity = { min: voice.velocity[0], max: voice.velocity[1] };
    folder.add(velocity, "min", 0, 1, 0.01).name("Velocity Min").onChange((value) => { voice.velocity[0] = value; apply(); });
    folder.add(velocity, "max", 0, 1, 0.01).name("Velocity Max").onChange((value) => { voice.velocity[1] = value; apply(); });
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

  const page = root.addFolder("Page Low-pass");
  slider(page, config.page, "cutoff", 80, 4000, 10, "Cutoff");
  slider(page, config.page, "resonance", 0.1, 12, 0.1, "Resonance");
  slider(page, config.page, "rampTime", 0.1, 8, 0.1, "Ramp Time (s)");
  page.add(toggles, "previewPage").name("Preview").onChange((value) => {
    engine.previewPage = value;
    apply();
  });

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

  setInterval(() => {
    engine.state.voices = engine.voiceCounts();
  }, 250);
}
