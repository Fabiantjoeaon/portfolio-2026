// Lossless format for baked 8-bit textures (`npm run textures:bake`). Each
// channel is stored as its own plane of gradient-predictor residuals, then
// gzipped: smooth data compresses several times better than raw bytes.

const predict = (data, at, x, y, rowStep, step) => {
  if (y === 0) return x ? data[at - step] : 0;
  if (x === 0) return data[at - rowStep];
  const value = data[at - step] + data[at - rowStep] - data[at - rowStep - step];
  return value < 0 ? 0 : value > 255 ? 255 : value;
};

/** First `channels` of interleaved `stride`-byte pixels → planar residuals (not yet gzipped). */
export function encodePlanes(data, width, height, channels, stride = channels) {
  const count = width * height;
  const out = new Uint8Array(count * channels);
  for (let c = 0; c < channels; c++) {
    for (let y = 0, p = 0; y < height; y++) {
      for (let x = 0; x < width; x++, p++) {
        const at = p * stride + c;
        out[c * count + p] = (data[at] - predict(data, at, x, y, width * stride, stride)) & 255;
      }
    }
  }
  return out;
}

/**
 * Planar residuals → interleaved pixels with `stride` bytes each. Channels past
 * `channels` are filled with `fill` (e.g. opaque alpha).
 */
export function decodePlanes(planes, width, height, channels, stride = channels, fill = 255) {
  const count = width * height;
  if (planes.length !== count * channels) return null;
  const out = new Uint8Array(count * stride);
  if (stride > channels) out.fill(fill);
  for (let c = 0; c < channels; c++) {
    let r = c * count;
    for (let y = 0; y < height; y++) {
      for (let x = 0, at = y * width * stride + c; x < width; x++, at += stride, r++) {
        out[at] = (planes[r] + predict(out, at, x, y, width * stride, stride)) & 255;
      }
    }
  }
  return out;
}

const isGzip = bytes => bytes[0] === 0x1f && bytes[1] === 0x8b;

/** Gunzips baked bytes. A host that already decoded the gzip passes them through. */
export async function inflate(buffer) {
  const bytes = new Uint8Array(buffer);
  if (!isGzip(bytes)) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
