import * as THREE from 'three/webgpu';

const WIDTH = 128;
const TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const toSrgbByte = linear => {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

/**
 * A 128px wide copy of `bitmap` in linear light, and the texture its blur is
 * written to. Blurring in linear light keeps highlights from turning muddy.
 */
export function createBlurSource(bitmap) {
  const width = WIDTH;
  const height = Math.max(1, Math.round(WIDTH * bitmap.height / bitmap.width));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const linear = new Float32Array(width * height * 3);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
    linear[j] = TO_LINEAR[pixels[i]];
    linear[j + 1] = TO_LINEAR[pixels[i + 1]];
    linear[j + 2] = TO_LINEAR[pixels[i + 2]];
  }
  const texture = new THREE.DataTexture(new Uint8Array(width * height * 4), width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { width, height, linear, scratch: new Float32Array(linear.length), result: new Float32Array(linear.length), texture };
}

/** Separable Gaussian of `sigma` texels, edges clamped, into the source's texture. */
export function blurInto(source, sigma) {
  const { width, height, linear, scratch, result, texture } = source;
  const radius = Math.ceil(sigma * 3);
  const kernel = new Float32Array(radius * 2 + 1);
  let total = 0;
  for (let k = -radius; k <= radius; k++) total += kernel[k + radius] = Math.exp(-(k * k) / (2 * sigma * sigma));
  for (let k = 0; k < kernel.length; k++) kernel[k] /= total;
  const pass = (from, to, length, lines, stride, step) => {
    for (let line = 0; line < lines; line++) {
      const start = line * stride;
      for (let i = 0; i < length; i++) {
        let r = 0, g = 0, b = 0;
        for (let k = -radius; k <= radius; k++) {
          const at = start + Math.min(length - 1, Math.max(0, i + k)) * step;
          const weight = kernel[k + radius];
          r += from[at] * weight;
          g += from[at + 1] * weight;
          b += from[at + 2] * weight;
        }
        const out = start + i * step;
        to[out] = r;
        to[out + 1] = g;
        to[out + 2] = b;
      }
    }
  };
  pass(linear, scratch, width, height, width * 3, 3);
  pass(scratch, result, height, width, 3, width * 3);
  const data = texture.image.data;
  for (let i = 0, j = 0; j < result.length; i += 4, j += 3) {
    data[i] = toSrgbByte(result[j]);
    data[i + 1] = toSrgbByte(result[j + 1]);
    data[i + 2] = toSrgbByte(result[j + 2]);
    data[i + 3] = 255;
  }
  texture.needsUpdate = true;
}
