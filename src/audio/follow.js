/**
 * Pitch pools derived from the arp so interactive layers answer it in key.
 * Pools are 12-bit pitch-class masks: allocation-free lookups at play time.
 * Pure (no Tone, no Vite aliases) so node tests can use it.
 */

const mod12 = (value) => ((value % 12) + 12) % 12;

/** @param {number[]} pcs */
export function maskOf(pcs) {
  let mask = 0;
  for (const pc of pcs) mask |= 1 << mod12(pc);
  return mask;
}

export const hasPc = (mask, midi) => (mask >> mod12(midi)) & 1;

/**
 * One pool per step: pitch classes of arp notes starting within `windowTicks`
 * (centered, wrapped over the loop), plus the arp note sounding at the step.
 * @param {import('./midi.js').MidiNote[]} notes - sorted by tick
 */
export function buildFollowPools(notes, { loopTicks, stepTicks, windowTicks }) {
  const steps = Math.max(1, Math.round(loopTicks / stepTicks));
  const masks = new Uint16Array(steps);
  const echo = new Uint8Array(steps);
  if (!notes.length) return { masks, echo };
  const half = windowTicks / 2;
  for (let step = 0; step < steps; step++) {
    const at = step * stepTicks;
    let sounding = notes[notes.length - 1];
    let mask = 0;
    for (const note of notes) {
      if (note.tick <= at) sounding = note;
      let distance = Math.abs(note.tick - at) % loopTicks;
      distance = Math.min(distance, loopTicks - distance);
      if (distance <= half) mask |= 1 << mod12(note.midi);
    }
    echo[step] = sounding.midi;
    masks[step] = mask | (1 << mod12(sounding.midi));
  }
  return { masks, echo };
}

/** Notes in [low, high] whose pitch class is in `mask`. */
export function countInRange(mask, low, high) {
  let count = 0;
  for (let midi = low; midi <= high; midi++) count += hasPc(mask, midi);
  return count;
}

/** The `index`-th pool note upwards from `low`, wrapping (negative too). -1 when empty. */
export function nthInRange(mask, low, high, index) {
  const count = countInRange(mask, low, high);
  if (!count) return -1;
  let target = ((index % count) + count) % count;
  for (let midi = low; midi <= high; midi++) {
    if (!hasPc(mask, midi)) continue;
    if (target-- === 0) return midi;
  }
  return -1;
}

/** Pool index of the first pool note at or above `midi` (last one if none). */
export function indexInRange(mask, low, high, midi) {
  let index = 0;
  for (let note = low; note <= high; note++) {
    if (!hasPc(mask, note)) continue;
    if (note >= midi) return index;
    index++;
  }
  return Math.max(0, index - 1);
}

/** Nearest note whose pitch class is in `mask`, preferring the lower one on a tie. */
export function snapToMask(midi, mask) {
  if (!mask || hasPc(mask, midi)) return midi;
  for (let distance = 1; distance < 12; distance++) {
    if (hasPc(mask, midi - distance)) return midi - distance;
    if (hasPc(mask, midi + distance)) return midi + distance;
  }
  return midi;
}

/** Notes outside `mask`, for warnings. @param {import('./midi.js').MidiNote[]} notes */
export function outOfKey(notes, mask) {
  return notes.filter((note) => !hasPc(mask, note.midi));
}
