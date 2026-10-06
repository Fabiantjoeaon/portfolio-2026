#!/usr/bin/env node
/**
 * Turns DAW stem exports into seamless loops for the `loops` in src/audio/song.js.
 *
 * Export each stem as the loop plus its reverb tail (e.g. 32 bars of music in
 * a 64 bar bounce, starting from silence). The tail past the loop length is
 * folded back onto the start, which is what the loop sounds like once it has
 * been playing. The result gets LOOP_PAD seconds of wrap-around audio on both
 * sides, metadata is stripped and it is encoded to public/<url>.
 *
 * Sources are `<sourceDir>/portfolio <NAME>.mp3` for every loop name.
 *
 * Usage:
 *   npm run audio:loops -- <sourceDir>              every loop
 *   npm run audio:loops -- <sourceDir> main drums   only these loops
 * Requires ffmpeg with libmp3lame on PATH.
 */
import { join, resolve } from "node:path";
import song from "../../src/audio/song.js";
import { LOOP_PAD } from "../../src/audio/loopFormat.js";
import { CHANNELS, ROOT, SAMPLE_RATE, audibleEnd, db, dbToGain, decode, encode, megabytes, peakOf } from "./pcm.mjs";

const SILENCE = dbToGain(-90);
const PEAK_LIMIT = dbToGain(-0.3);

const sourceName = (name) => `portfolio ${name.toUpperCase()}.mp3`;

function rms(samples, from, frames) {
  let sum = 0;
  for (let i = from * CHANNELS; i < (from + frames) * CHANNELS; i++) sum += samples[i] ** 2;
  return Math.sqrt(sum / (frames * CHANNELS));
}

/** Sample jump and 20ms levels where playback wraps from `end` back to `start`. */
function seam(samples, start, end) {
  const window = Math.round(SAMPLE_RATE * 0.02);
  let jump = 0;
  for (let c = 0; c < CHANNELS; c++) jump = Math.max(jump, Math.abs(samples[start * CHANNELS + c] - samples[(end - 1) * CHANNELS + c]));
  return `jump ${db(jump)}, level ${db(rms(samples, end - window, window))} -> ${db(rms(samples, start, window))}`;
}

function processLoop(name, loop, sourceDir) {
  const beats = song.transport.timeSignature[0];
  const loopFrames = Math.round((loop.bars * beats * 60 * SAMPLE_RATE) / loop.bpm);
  const padFrames = Math.round(LOOP_PAD * SAMPLE_RATE);
  const source = decode(join(sourceDir, sourceName(name)));
  const sourceFrames = source.length / CHANNELS;

  if (sourceFrames < loopFrames) throw new Error(`${name}: ${sourceFrames} frames, shorter than the ${loop.bars} bar loop`);
  if (sourceFrames - loopFrames < SAMPLE_RATE) {
    console.warn(`[loops] ${name}: no tail in the export, the reverb at the seam will be cut. Export ${loop.bars} bars plus the tail.`);
  }

  const body = source.slice(0, loopFrames * CHANNELS);
  const rawSeam = seam(body, 0, loopFrames);
  const tailFrames = Math.max(0, audibleEnd(source, loopFrames, SILENCE) - loopFrames);
  for (let i = 0; i < tailFrames * CHANNELS; i++) body[i % body.length] += source[loopFrames * CHANNELS + i];

  const sourcePeak = peakOf(source);
  const peak = peakOf(body);
  const gain = peak > PEAK_LIMIT ? PEAK_LIMIT / peak : 1;
  if (gain < 1) for (let i = 0; i < body.length; i++) body[i] *= gain;

  const out = new Float32Array((loopFrames + padFrames * 2) * CHANNELS);
  out.set(body.subarray((loopFrames - padFrames) * CHANNELS), 0);
  out.set(body, padFrames * CHANNELS);
  out.set(body.subarray(0, padFrames * CHANNELS), (padFrames + loopFrames) * CHANNELS);

  const path = join(ROOT, "public", loop.url);
  encode(out, path);

  const decoded = decode(path);
  const decodedFrames = decoded.length / CHANNELS;
  console.log([
    `[loops] ${name} -> public/${loop.url}`,
    `  tail folded  ${(tailFrames / SAMPLE_RATE).toFixed(2)}s`,
    `  peak         export ${db(sourcePeak)}, folded ${db(peak)}${gain < 1 ? `, reduced by ${db(1 / gain)} (raise the loop volume to compensate)` : ""}`,
    `  seam before  ${rawSeam}`,
    `  seam after   ${seam(decoded, padFrames, padFrames + loopFrames)}`,
    `  frames       ${decodedFrames} decoded, ${out.length / CHANNELS} written`,
    `  size         ${megabytes(path)}`,
  ].join("\n"));
}

const [sourceDir, ...only] = process.argv.slice(2);
if (!sourceDir) {
  console.error("Usage: npm run audio:loops -- <sourceDir> [loop names]");
  process.exit(1);
}
for (const [name, loop] of Object.entries(song.loops ?? {})) {
  if (only.length && !only.includes(name)) continue;
  processLoop(name, loop, resolve(sourceDir));
}
