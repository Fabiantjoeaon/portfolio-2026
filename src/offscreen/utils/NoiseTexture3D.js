import * as THREE from "three/webgpu";
import { texture3D } from "three/tsl";

const NOISE_3D_SIZE = 64;
// Lattice cells per tile. 8 texels per cell keeps the trilinear fetch smooth.
export const NOISE_3D_PERIOD = 8;

let noise3DNode = null;

/**
 * Seamlessly tileable single-octave 3D Perlin noise, signed like
 * `mx_noise_float`. Shared by every scene; built once, never per frame.
 */
export function createNoiseTexture3D(size = NOISE_3D_SIZE, period = NOISE_3D_PERIOD) {
  const data = new Uint16Array(size * size * size);
  const perm = createPermutationTable();
  const scale = period / size;
  let i = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = tiledPerlinNoise3D(x * scale, y * scale, z * scale, period, perm);
        data[i++] = THREE.DataUtils.toHalfFloat(n);
      }
    }
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.name = "Perlin noise 3D";
  texture.format = THREE.RedFormat;
  texture.type = THREE.HalfFloatType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.wrapR = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Drop-in for `mx_noise_float(position)`: one trilinear fetch of the shared
 * tileable volume. Explicit LOD, so it is valid in vertex, compute and loops.
 */
export function perlin3D(position) {
  noise3DNode ??= texture3D(createNoiseTexture3D());
  return noise3DNode.sample(position.div(NOISE_3D_PERIOD)).level(0).r;
}

/**
 * Creates a seamlessly tileable 2D Perlin noise texture.
 * Pre-computed for efficient GPU sampling in fog/atmospheric effects.
 *
 * @param {number} size - Texture resolution (size x size). Default 256.
 * @param {number} octaves - Number of FBM octaves. Default 4.
 * @param {number} persistence - Amplitude decay per octave. Default 0.5.
 * @returns {THREE.DataTexture} - 2D RGBA texture with noise patterns.
 */
export function createNoiseTexture2D(
  size = 256,
  octaves = 4,
  persistence = 0.5
) {
  const data = new Uint8Array(size * size * 4); // RGBA

  const perm = createPermutationTable();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      // Generate multiple noise channels for RGB
      const r = fbmNoise2D(nx, ny, octaves, persistence, perm, size);
      const g = fbmNoise2D(
        nx + 0.33,
        ny + 0.33,
        octaves,
        persistence,
        perm,
        size
      );
      const b = fbmNoise2D(
        nx + 0.66,
        ny + 0.66,
        octaves,
        persistence,
        perm,
        size
      );

      const idx = (x + y * size) * 4;
      data[idx] = Math.floor((r * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.floor((g * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.floor((b * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;

  return texture;
}

/**
 * FBM noise for 2D coordinates.
 */
function fbmNoise2D(x, y, octaves, persistence, perm, tileSize) {
  let total = 0;
  let frequency = 4;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    const fx = x * frequency;
    const fy = y * frequency;

    total += tiledPerlinNoise2D(fx, fy, frequency, perm) * amplitude;

    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return total / maxValue;
}

/**
 * 2D Perlin noise that tiles at the given period.
 */
function tiledPerlinNoise2D(x, y, period, perm) {
  const xi = Math.floor(x) % period;
  const yi = Math.floor(y) % period;

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const xi1 = (xi + 1) % period;
  const yi1 = (yi + 1) % period;

  const aa = perm[perm[xi] + yi];
  const ab = perm[perm[xi] + yi1];
  const ba = perm[perm[xi1] + yi];
  const bb = perm[perm[xi1] + yi1];

  const x1 = lerp(grad2D(aa, xf, yf), grad2D(ba, xf - 1, yf), u);
  const x2 = lerp(grad2D(ab, xf, yf - 1), grad2D(bb, xf - 1, yf - 1), u);

  return lerp(x1, x2, v);
}

function tiledPerlinNoise3D(x, y, z, period, perm) {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const xi = fx % period;
  const yi = fy % period;
  const zi = fz % period;
  const xi1 = (xi + 1) % period;
  const yi1 = (yi + 1) % period;
  const zi1 = (zi + 1) % period;
  const xf = x - fx;
  const yf = y - fy;
  const zf = z - fz;
  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const hash = (a, b, c) => perm[perm[perm[a] + b] + c];
  const x00 = lerp(grad3D(hash(xi, yi, zi), xf, yf, zf), grad3D(hash(xi1, yi, zi), xf - 1, yf, zf), u);
  const x10 = lerp(grad3D(hash(xi, yi1, zi), xf, yf - 1, zf), grad3D(hash(xi1, yi1, zi), xf - 1, yf - 1, zf), u);
  const x01 = lerp(grad3D(hash(xi, yi, zi1), xf, yf, zf - 1), grad3D(hash(xi1, yi, zi1), xf - 1, yf, zf - 1), u);
  const x11 = lerp(grad3D(hash(xi, yi1, zi1), xf, yf - 1, zf - 1), grad3D(hash(xi1, yi1, zi1), xf - 1, yf - 1, zf - 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

function grad3D(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/**
 * 2D gradient function.
 */
function grad2D(hash, x, y) {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/**
 * Creates a permutation table for Perlin noise.
 */
function createPermutationTable() {
  const p = new Array(256);
  for (let i = 0; i < 256; i++) {
    p[i] = i;
  }

  // Fisher-Yates shuffle with fixed seed for reproducibility
  let seed = 12345;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }

  // Double the table for wraparound
  const perm = new Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
  }

  return perm;
}

/**
 * Fade function for smooth interpolation (6t^5 - 15t^4 + 10t^3).
 */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Linear interpolation.
 */
function lerp(a, b, t) {
  return a + t * (b - a);
}

