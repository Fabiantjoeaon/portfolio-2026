import * as THREE from 'three/webgpu';

export const BLUR_WIDTH = 128;
const TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const toSrgbByte = linear => {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

export const blurHeight = (width, height) => Math.max(1, Math.round(BLUR_WIDTH * height / width));

/** RGBA sRGB bytes → linear RGB floats. */
export function toLinear(pixels) {
  const linear = new Float32Array(pixels.length / 4 * 3);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
    linear[j] = TO_LINEAR[pixels[i]];
    linear[j + 1] = TO_LINEAR[pixels[i + 1]];
    linear[j + 2] = TO_LINEAR[pixels[i + 2]];
  }
  return linear;
}

/**
 * Separable Gaussian of `sigma` texels over linear RGB, edges clamped, written
 * to `out` as opaque sRGB RGBA bytes. Blurring in linear light keeps
 * highlights from turning muddy.
 */
export function gaussianBlur(linear, width, height, sigma, out, scratch = new Float32Array(linear.length), result = new Float32Array(linear.length)) {
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
  for (let i = 0, j = 0; j < result.length; i += 4, j += 3) {
    out[i] = toSrgbByte(result[j]);
    out[i + 1] = toSrgbByte(result[j + 1]);
    out[i + 2] = toSrgbByte(result[j + 2]);
    out[i + 3] = 255;
  }
  return out;
}

const blurTexture = image => {
  const texture = image instanceof Uint8Array
    ? new THREE.DataTexture(image, BLUR_WIDTH, image.length / 4 / BLUR_WIDTH, THREE.RGBAFormat)
    : new THREE.Texture(image);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

/** A blur baked by `npm run media:projects` (see `blurPath`). */
export const bakedBlurSource = bitmap => ({ texture: blurTexture(bitmap) });

/**
 * A 128px wide copy of `bitmap` in linear light, and the texture its blur is
 * written to; `blurInto` (re)blurs it.
 */
export function createBlurSource(bitmap) {
  const width = BLUR_WIDTH;
  const height = blurHeight(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  const linear = toLinear(context.getImageData(0, 0, width, height).data);
  const texture = blurTexture(new Uint8Array(width * height * 4));
  return { width, height, linear, scratch: new Float32Array(linear.length), result: new Float32Array(linear.length), texture };
}

export function blurInto(source, sigma) {
  const { width, height, linear, scratch, result, texture } = source;
  gaussianBlur(linear, width, height, sigma, texture.image.data, scratch, result);
  texture.needsUpdate = true;
}
