/** ffmpeg-backed PCM helpers for the sample build scripts: 48 kHz interleaved stereo float32. */
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SAMPLE_RATE = 48000;
export const CHANNELS = 2;

function ffmpeg(args, input) {
  const result = spawnSync("ffmpeg", ["-v", "error", ...args], { input, maxBuffer: 1 << 30 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
}

/** @returns {Float32Array} */
export function decode(path) {
  const bytes = ffmpeg(["-i", path, "-f", "f32le", "-ac", String(CHANNELS), "-ar", String(SAMPLE_RATE), "pipe:1"]);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

/** MP3 without ID3 tags or metadata; the Xing/LAME header stays for gapless decoding. */
export function encode(samples, path, quality = "2") {
  mkdirSync(dirname(path), { recursive: true });
  const input = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  ffmpeg([
    "-y", "-f", "f32le", "-ar", String(SAMPLE_RATE), "-ac", String(CHANNELS), "-i", "pipe:0",
    "-map_metadata", "-1", "-id3v2_version", "0",
    "-c:a", "libmp3lame", "-q:a", quality, path,
  ], input);
}

/** Frame index after the last sample above `threshold`, searching back to `from`. */
export function audibleEnd(samples, from, threshold) {
  for (let i = samples.length - 1; i >= from * CHANNELS; i--) {
    if (Math.abs(samples[i]) > threshold) return Math.floor(i / CHANNELS) + 1;
  }
  return from;
}

export function peakOf(samples) {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  return peak;
}

export const dbToGain = (db) => 10 ** (db / 20);
export const db = (gain) => `${(20 * Math.log10(Math.max(gain, 1e-9))).toFixed(1)} dB`;
export const megabytes = (path) => `${(statSync(path).size / 1024 / 1024).toFixed(2)} MB`;
