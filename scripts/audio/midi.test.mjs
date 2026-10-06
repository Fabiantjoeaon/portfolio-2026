import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseMidi, toPart } from "../../src/audio/midi.js";
import { buildFollowPools, hasPc, indexInRange, maskOf, nthInRange, outOfKey, snapToMask } from "../../src/audio/follow.js";
import { scalePcs } from "../../src/audio/harmony.js";
import song from "../../src/audio/song.js";

const PPQ = 192;
const BAR = PPQ * 4;
const load = (name) => toPart(parseMidi(readFileSync(fileURLToPath(new URL(`../../public/${song.midi[name]}`, import.meta.url)))), PPQ);
const scale = maskOf(scalePcs(song.key));

test("song arp is an 8-bar loop of sixteenths that divides the 32-bar stems", () => {
  const arp = load("arp");
  assert.equal(arp.loopTicks, 8 * BAR);
  assert.equal(arp.notes.length, 128);
  assert.equal(arp.polyphony, 1);
  assert.equal(arp.notes[1].tick, PPQ / 4);
  for (const loop of Object.values(song.loops)) assert.equal((loop.bars * BAR) % arp.loopTicks, 0);
});

test("every song note is in key", () => {
  for (const name of Object.keys(song.midi)) assert.deepEqual(outOfKey(load(name).notes, scale), [], name);
});

test("follow pools are never empty and stay in key", () => {
  const arp = load("arp");
  const { masks, echo } = buildFollowPools(arp.notes, { loopTicks: arp.loopTicks, stepTicks: PPQ / 4, windowTicks: PPQ });
  assert.equal(masks.length, 128);
  for (let step = 0; step < masks.length; step++) {
    assert.ok(masks[step], `step ${step} empty`);
    assert.equal(masks[step] & ~scale, 0, `step ${step} out of key`);
    assert.ok(hasPc(masks[step], echo[step]));
  }
  assert.equal(echo[0], 63);
  assert.equal(echo[1], 70);
});

test("pool lookups wrap, anchor and snap", () => {
  const mask = maskOf([9, 0, 4]);
  assert.equal(nthInRange(mask, 57, 69, 0), 57);
  assert.equal(nthInRange(mask, 57, 69, 1), 60);
  assert.equal(nthInRange(mask, 57, 69, -1), 69);
  assert.equal(nthInRange(0, 57, 69, 0), -1);
  assert.equal(indexInRange(mask, 57, 69, 61), 2);
  assert.equal(snapToMask(62, scale), 61);
  assert.equal(snapToMask(63, scale), 63);
});

test("parser handles running status and note-on velocity 0 as note-off", () => {
  const track = [0x00, 0x90, 60, 100, 0x60, 60, 0, 0x00, 62, 90, 0x60, 0x80, 62, 0, 0x00, 0xff, 0x2f, 0x00];
  const bytes = Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length, ...track,
  ]);
  const file = parseMidi(bytes);
  assert.deepEqual(file.notes.map(({ tick, duration, midi }) => [tick, duration, midi]), [[0, 96, 60], [96, 96, 62]]);
});
