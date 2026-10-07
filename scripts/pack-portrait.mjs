// Packs the About portrait point clouds for the web:
//   originals/about/<name>.buf   little-endian Float32 rows [x, y, z, nx, ny, nz, luminance]
//   → public/assets/about/<name>.bin   (pick one at runtime with ?portrait=<name>)
// <name>.bin (little-endian, ~10 bytes per particle, particle order preserved):
//   Uint32 count, Float32 min[3], Float32 max[3]
//   Uint16 position[count * 3]   quantized within min..max
//   Int8   normal[count * 3]     unit direction, snorm
//   Uint8  luminance[count]      0..1
//   node scripts/pack-portrait.mjs            every .buf in originals/about
//   node scripts/pack-portrait.mjs <input> [output]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const SOURCE_DIR = 'originals/about';
const OUTPUT_DIR = 'public/assets/about';
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function pack(input, output) {
  const bytes = readFileSync(input);
  if (!bytes.byteLength || bytes.byteLength % 28) throw new Error(`${input} must contain seven Float32 values per particle`);
  const source = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const count = source.length / 7;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < source.length; i++) {
    if (!Number.isFinite(source[i])) throw new Error(`${input} contains a non-finite value`);
    const axis = i % 7;
    if (axis < 3) {
      min[axis] = Math.min(min[axis], source[i]);
      max[axis] = Math.max(max[axis], source[i]);
    }
  }

  const out = new ArrayBuffer(28 + count * 10);
  const header = new DataView(out);
  header.setUint32(0, count, true);
  for (let axis = 0; axis < 3; axis++) {
    header.setFloat32(4 + axis * 4, min[axis], true);
    header.setFloat32(16 + axis * 4, max[axis], true);
  }
  const positions = new Uint16Array(out, 28, count * 3);
  const normals = new Int8Array(out, 28 + count * 6, count * 3);
  const luminances = new Uint8Array(out, 28 + count * 9, count);

  for (let i = 0; i < count; i++) {
    const row = i * 7;
    for (let axis = 0; axis < 3; axis++) {
      const range = max[axis] - min[axis] || 1;
      positions[i * 3 + axis] = Math.round((source[row + axis] - min[axis]) / range * 65535);
    }
    const length = Math.hypot(source[row + 3], source[row + 4], source[row + 5]) || 1;
    for (let axis = 0; axis < 3; axis++) normals[i * 3 + axis] = Math.round(source[row + 3 + axis] / length * 127);
    luminances[i] = Math.round(clamp(source[row + 6], 0, 1) * 255);
  }

  writeFileSync(output, new Uint8Array(out));
  console.log(`${output}: ${count} particles, ${bytes.byteLength} → ${out.byteLength} bytes`);
}

const [input, output] = process.argv.slice(2);
if (input) pack(input, output ?? join(OUTPUT_DIR, `${basename(input, '.buf')}.bin`));
else {
  for (const file of readdirSync(SOURCE_DIR).filter(file => file.endsWith('.buf'))) {
    const name = basename(file, '.buf');
    // Query values and URLs can't carry characters like "?".
    const safe = name.replace(/[^\w-]/g, 'x');
    if (safe !== name) console.warn(`! "${file}" is written as ${safe}.bin`);
    pack(join(SOURCE_DIR, file), join(OUTPUT_DIR, `${safe}.bin`));
  }
}
