import { isIOS } from "@/shared/devices";

// iOS runs Web Audio in the "ambient" session, which obeys the silent switch.
// The "playback" session ignores it; media elements use it, so on iOS
// versions without navigator.audioSession a silent looping element flips it.
let silence = null;

function silentWav() {
  const samples = 800;
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([view], { type: "audio/wav" }));
}

/** Call inside a user gesture, before the AudioContext resumes. */
export function enablePlaybackSession() {
  if ("audioSession" in navigator) {
    navigator.audioSession.type = "playback";
    return;
  }
  if (!isIOS()) return;
  if (!silence) {
    silence = document.createElement("audio");
    silence.setAttribute("x-webkit-airplay", "deny");
    silence.preload = "auto";
    silence.loop = true;
    silence.src = silentWav();
  }
  silence.play().catch(() => {});
}

/** Hands the audio session back so other apps' audio can resume. */
export function releasePlaybackSession() {
  if ("audioSession" in navigator) navigator.audioSession.type = "ambient";
  else silence?.pause();
}
