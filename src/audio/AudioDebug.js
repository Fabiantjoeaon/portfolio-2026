import { store } from "@/offscreen/store";
import { getDebugFolder } from "@/offscreen/debug/bindDebugParams";

const GRIDS = ["32n", "16n", "8n", "8n.", "4n"];
const LENGTHS = ["32n", "16n", "8n", "8n.", "4n", "2n"];

/**
 * Audio folder (?debug). Controls write straight into `engine.config` (the
 * live merged config) and re-apply it; "Copy overrides" exports the diff.
 * @param {import('./AudioEngine.js').AudioEngine} engine
 */
export function createAudioDebug(engine, gui) {
  const root = store.gl?.inspector?.createParameters?.("Audio") ?? getDebugFolder(gui, "Audio");
  if (!root) return;
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
  button(global, "Copy overrides", async () => {
    const snippet = engine.overridesSnippet();
    console.log(snippet);
    await navigator.clipboard?.writeText(snippet).catch(() => {});
  });

  const pad = root.addFolder("Pad");
  slider(pad, config.pad, "volume", -40, 0, 0.5, "Volume (dB)");
  slider(pad, config.pad, "dry", 0, 1, 0.01, "Dry");
  slider(pad, config.pad, "reverbSend", 0, 1.5, 0.01, "Reverb Send");
  slider(pad, config.pad, "velocity", 0.05, 1, 0.01, "Velocity");
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

  const patterns = Object.keys(config.patterns);
  const voiceControls = (folder, voice, burstTarget) => {
    slider(folder, voice, "volume", -40, 0, 0.5, "Volume (dB)");
    slider(folder, voice, "voices", 1, 8, 1, "Voice Limit");
    select(folder, voice, "pattern", patterns, "Pattern");
    slider(folder, voice, "octave", 1, 7, 1, "Octave");
    select(folder, voice, "noteLength", LENGTHS, "Note Length");
    slider(folder, voice.synth.envelope, "attack", 0.001, 1, 0.001, "Attack");
    slider(folder, voice.synth.envelope, "decay", 0.01, 3, 0.01, "Decay");
    slider(folder, voice.synth.envelope, "sustain", 0, 1, 0.01, "Sustain");
    slider(folder, voice.synth.envelope, "release", 0.01, 4, 0.01, "Release");
    slider(folder, voice.filter, "frequency", 100, 12000, 10, "Filter Freq");
    slider(folder, voice.filter, "Q", 0.1, 10, 0.1, "Filter Q");
    slider(folder, voice, "dry", 0, 1, 0.01, "Dry");
    slider(folder, voice, "reverbSend", 0, 1.5, 0.01, "Reverb Send");
    if (voice.delaySend !== undefined) slider(folder, voice, "delaySend", 0, 1, 0.01, "Delay Send");
    button(folder, "Test burst", () => engine.burst(burstTarget));
  };

  voiceControls(root.addFolder("Meadow"), config.scenes.meadow, "meadow");
  voiceControls(root.addFolder("Cube"), config.scenes.cube, "cube");
  const ice = root.addFolder("Ice");
  select(ice, config.scenes.ice.delay, "time", GRIDS, "Delay Time");
  slider(ice, config.scenes.ice.delay, "feedback", 0, 0.9, 0.01, "Delay Feedback");
  slider(ice, config.scenes.ice.delay, "filter", 200, 10000, 10, "Delay Filter");
  slider(ice, config.scenes.ice, "panAmount", 0, 1, 0.01, "Pan Amount");
  voiceControls(ice.addFolder("Floor"), config.scenes.ice.floor, "iceFloor");
  voiceControls(ice.addFolder("Wall"), config.scenes.ice.wall, "iceWall");

  const page = root.addFolder("Page Low-pass");
  slider(page, config.page, "cutoff", 80, 4000, 10, "Cutoff");
  slider(page, config.page, "resonance", 0.1, 12, 0.1, "Resonance");
  slider(page, config.page, "rampTime", 0.1, 8, 0.1, "Ramp Time (s)");
  page.add(toggles, "previewPage").name("Preview").onChange((value) => {
    engine.previewPage = value;
    apply();
  });

  const sfx = root.addFolder("SFX Click");
  slider(sfx, config.sfx, "frequency", 500, 12000, 10, "Filter Freq");
  slider(sfx, config.sfx, "Q", 0.1, 10, 0.1, "Filter Q");
  slider(sfx, config.sfx, "jitter", 0, 1.5, 0.01, "Jitter (oct)");
  slider(sfx, config.sfx, "decay", 0.002, 0.08, 0.001, "Decay");
  slider(sfx, config.sfx, "volume", -48, 0, 0.5, "Volume (dB)");
  slider(sfx, config.sfx, "throttleMs", 0, 200, 1, "Throttle (ms)");
  button(sfx, "Test click", () => engine.playClick());

  setInterval(() => {
    engine.state.voices = engine.voiceCounts();
  }, 250);
}
