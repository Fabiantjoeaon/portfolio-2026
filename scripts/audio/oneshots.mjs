#!/usr/bin/env node
/**
 * Optimizes one-shot SFX for the `oneShots` in src/audio/song.js: trims
 * leading and trailing silence, fades out the cut, keeps the peak below
 * -0.3 dBFS, strips metadata and encodes to public/<url>.
 *
 * Usage:
 *   npm run audio:oneshots -- transition="~/SFX/transition.mp3" projectHover="~/SFX/hover.mp3"
 * Requires ffmpeg with libmp3lame on PATH.
 */
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import song from "../../src/audio/song.js";
import { CHANNELS, ROOT, SAMPLE_RATE, audibleEnd, db, dbToGain, decode, encode, megabytes, peakOf } from "./pcm.mjs";

const SILENCE = dbToGain(-70);
const PEAK_LIMIT = dbToGain(-0.3);
const PRE_ROLL = 0.002;
const TAIL = 0.02;
const FADE_OUT = 0.01;
const QUALITY = "4";

function audibleStart(samples, threshold) {
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > threshold) return Math.floor(i / CHANNELS);
  return 0;
}

function processShot(name, sourcePath) {
  const shot = song.oneShots?.[name];
  if (!shot) throw new Error(`no oneShots.${name} in src/audio/song.js`);
  const source = decode(sourcePath);
  const frames = source.length / CHANNELS;
  const start = Math.max(0, audibleStart(source, SILENCE) - Math.round(PRE_ROLL * SAMPLE_RATE));
  const end = Math.min(frames, audibleEnd(source, start, SILENCE) + Math.round(TAIL * SAMPLE_RATE));
  const out = source.slice(start * CHANNELS, end * CHANNELS);

  const fadeFrames = Math.min(Math.round(FADE_OUT * SAMPLE_RATE), end - start);
  const length = end - start;
  for (let f = 0; f < fadeFrames; f++) {
    const gain = f / fadeFrames;
    for (let c = 0; c < CHANNELS; c++) out[(length - 1 - f) * CHANNELS + c] *= gain;
  }

  const peak = peakOf(out);
  const gain = peak > PEAK_LIMIT ? PEAK_LIMIT / peak : 1;
  if (gain < 1) for (let i = 0; i < out.length; i++) out[i] *= gain;

  const path = join(ROOT, "public", shot.url);
  encode(out, path, QUALITY);
  console.log([
    `[oneshots] ${name} -> public/${shot.url}`,
    `  trimmed  ${(frames / SAMPLE_RATE).toFixed(2)}s -> ${(length / SAMPLE_RATE).toFixed(2)}s (start ${(start / SAMPLE_RATE).toFixed(3)}s)`,
    `  peak     ${db(peak)}${gain < 1 ? `, reduced by ${db(1 / gain)}` : ""}`,
    `  size     ${megabytes(path)}`,
  ].join("\n"));
}

const pairs = process.argv.slice(2).map((arg) => arg.split(/=(.*)/s));
if (!pairs.length || pairs.some(([, path]) => !path)) {
  console.error('Usage: npm run audio:oneshots -- <name>="<source file>" ...');
  process.exit(1);
}
for (const [name, path] of pairs) processShot(name, resolve(path.replace(/^~(?=\/)/, homedir())));
