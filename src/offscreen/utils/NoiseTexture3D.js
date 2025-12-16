import * as THREE from "three/webgpu";

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

