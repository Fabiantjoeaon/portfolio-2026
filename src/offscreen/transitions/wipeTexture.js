import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping } from "three/webgpu";

const SIZE = 64;
const SOURCE_SIZE = 128;

/** Lift an artist's grayscale image into a smooth, periodic volume once.
 * Coordinates fold through the interior of the image, so even non-tileable
 * uploads join continuously. No surface normals or projection weights are
 * involved. The render loop only reads the resulting 256 KiB texture.
 */
export function createWipeTexture(image, flipY = false) {
  const data = new Uint8Array(SIZE ** 3);
  data.fill(128);

  if (image) {
    const canvas = new OffscreenCanvas(SOURCE_SIZE, SOURCE_SIZE);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingQuality = "high";
    if (flipY) {
      context.translate(0, SOURCE_SIZE);
      context.scale(1, -1);
    }
    context.drawImage(image, 0, 0, SOURCE_SIZE, SOURCE_SIZE);
    const pixels = context.getImageData(0, 0, SOURCE_SIZE, SOURCE_SIZE).data;
    const gray = new Float32Array(SOURCE_SIZE ** 2);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = (pixels[i * 4] * 0.2126 + pixels[i * 4 + 1] * 0.7152 + pixels[i * 4 + 2] * 0.0722) / 255;
    }
    // Each slice reuses its horizontal coordinates across every row.
    // Keep trigonometry and coordinate decomposition out of the voxel loop.
    const xIndex = new Uint8Array(SIZE);
    const xFraction = new Float64Array(SIZE);
    for (let z = 0; z < SIZE; z++) {
      const depth = (z + 0.5) / SIZE * Math.PI * 2;
      const warpX = Math.sin(depth) * 0.7, warpY = Math.cos(depth) * 0.7;
      for (let x = 0; x < SIZE; x++) {
        const sx = (0.5 + 0.44 * Math.sin((x + 0.5) / SIZE * Math.PI * 2 + warpX)) * (SOURCE_SIZE - 1);
        xIndex[x] = Math.floor(sx);
        xFraction[x] = sx - xIndex[x];
      }
      for (let y = 0; y < SIZE; y++) {
        const sy = (0.5 + 0.44 * Math.sin((y + 0.5) / SIZE * Math.PI * 2 + warpY)) * (SOURCE_SIZE - 1);
        const iy = Math.floor(sy), fy = sy - iy;
        const row = iy * SOURCE_SIZE, output = (z * SIZE + y) * SIZE;
        for (let x = 0; x < SIZE; x++) {
          const offset = row + xIndex[x], fx = xFraction[x];
          const a = gray[offset] * (1 - fx) + gray[offset + 1] * fx;
          const b = gray[offset + SOURCE_SIZE] * (1 - fx) + gray[offset + SOURCE_SIZE + 1] * fx;
          data[output + x] = Math.round((a * (1 - fy) + b * fy) * 255);
        }
      }
    }
  }

  const texture = new Data3DTexture(data, SIZE, SIZE, SIZE);
  texture.name = "Continuous wipe texture";
  texture.format = RedFormat;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
