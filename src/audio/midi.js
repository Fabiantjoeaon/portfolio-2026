/**
 * Minimal Standard MIDI File reader: note on/off from every track, nothing
 * else. Pure (no Tone, no Vite aliases) so node tests can use it.
 */

/**
 * @typedef {{ tick: number, duration: number, midi: number, velocity: number }} MidiNote
 * @typedef {{ ppq: number, endTick: number, notes: MidiNote[] }} MidiFile
 * @typedef {{ notes: MidiNote[], loopTicks: number, polyphony: number }} MidiPart
 */

/** @param {ArrayBuffer | Uint8Array} source @returns {MidiFile} */
export function parseMidi(source) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (text(0) !== "MThd") throw new Error("Not a MIDI file");
  const tracks = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new Error("SMPTE time division is not supported");

  const notes = [];
  let endTick = 0;
  let offset = 8 + view.getUint32(4);
  for (let track = 0; track < tracks && offset < bytes.length; track++) {
    if (text(offset) !== "MTrk") throw new Error(`Missing track chunk ${track}`);
    const end = offset + 8 + view.getUint32(offset + 4);
    let position = offset + 8;
    let tick = 0;
    let status = 0;
    const open = new Map();
    const readLength = () => {
      let value = 0;
      let byte;
      do {
        byte = bytes[position++];
        value = (value << 7) | (byte & 0x7f);
      } while (byte & 0x80);
      return value;
    };
    const close = (midi, at) => {
      const stack = open.get(midi);
      const start = stack?.shift();
      if (start) notes.push({ tick: start.tick, duration: Math.max(1, at - start.tick), midi, velocity: start.velocity });
    };

    while (position < end) {
      tick += readLength();
      const lead = bytes[position];
      if (lead === 0xff || lead === 0xf0 || lead === 0xf7) {
        position += lead === 0xff ? 2 : 1;
        const length = readLength();
        position += length;
        continue;
      }
      if (lead & 0x80) status = bytes[position++];
      const type = status >> 4;
      if (type === 0xc || type === 0xd) {
        position += 1;
        continue;
      }
      const data1 = bytes[position++];
      const data2 = bytes[position++];
      if (type === 0x9 && data2 > 0) {
        if (!open.has(data1)) open.set(data1, []);
        open.get(data1).push({ tick, velocity: data2 });
      } else if (type === 0x8 || type === 0x9) {
        close(data1, tick);
      }
    }
    for (const midi of open.keys()) while (open.get(midi).length) close(midi, tick);
    endTick = Math.max(endTick, tick);
    offset = end;
  }
  notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
  return { ppq: division, endTick, notes };
}

/**
 * Rescales to `ppq` and rounds the length up to whole bars, allowing a
 * sixteenth of slack for exporters that overshoot the last bar line.
 * @param {MidiFile} file @returns {MidiPart}
 */
export function toPart(file, ppq, beatsPerBar = 4) {
  const scale = ppq / file.ppq;
  const notes = file.notes.map((note) => ({
    tick: Math.round(note.tick * scale),
    duration: Math.max(1, Math.round(note.duration * scale)),
    midi: note.midi,
    velocity: note.velocity / 127,
  }));
  const barTicks = ppq * beatsPerBar;
  let end = Math.round(file.endTick * scale);
  for (const note of notes) end = Math.max(end, note.tick + note.duration);
  const loopTicks = Math.max(1, Math.ceil((end - ppq / 4) / barTicks)) * barTicks;
  return { notes, loopTicks, polyphony: polyphonyOf(notes) };
}

function polyphonyOf(notes) {
  const edges = [];
  for (const note of notes) edges.push([note.tick, 1], [note.tick + note.duration, -1]);
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let max = 0;
  for (const [, delta] of edges) max = Math.max(max, (current += delta));
  return max;
}
