import * as THREE from "three/webgpu";
import { decodePlanes } from "../../shared/bakedPlanes.js";

// Four Gaussian approximations packed into RGBA. Baked by `npm run
// textures:bake`, or generated once at wall creation, never in the render
// loop; all glyphs share this one atlas.
export const GLYPH_BLUR_RADII = [1, 3, 7, 14];
const PADDING = 32;

function boxBlur(source, width, height, radius, horizontal) {
  const output = new Float32Array(source.length);
  const length = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const stride = horizontal ? 1 : width;
  const divisor = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const start = horizontal ? line * width : line;
    let sum = 0;
    for (let i = 0; i <= radius && i < length; i++) sum += source[start + i * stride];
    for (let i = 0; i < length; i++) {
      output[start + i * stride] = sum / divisor;
      if (i >= radius) sum -= source[start + (i - radius) * stride];
      if (i + radius + 1 < length) sum += source[start + (i + radius + 1) * stride];
    }
  }
  return output;
}

function glyphKey(rect, width, height) {
  return `${Math.round(rect[0] * width)},${Math.round(rect[1] * height)}`;
}

/** Tile placement of `selectedGlyphs`, padded for the widest blur. */
export function layoutGlyphCoverage(font, selectedGlyphs = [...font.glyphs.values()]) {
  const { atlasWidth, atlasHeight } = font;
  const glyphs = selectedGlyphs.filter(g => g.uvRect[2] > g.uvRect[0]);
  const columns = Math.ceil(Math.sqrt(glyphs.length));
  const widths = glyphs.map(g => Math.round((g.uvRect[2] - g.uvRect[0]) * atlasWidth));
  const heights = glyphs.map(g => Math.round(Math.abs(g.uvRect[3] - g.uvRect[1]) * atlasHeight));
  const cellWidth = Math.max(...widths) + PADDING * 2;
  const cellHeight = Math.max(...heights) + PADDING * 2;
  const width = columns * cellWidth;
  const height = Math.ceil(glyphs.length / columns) * cellHeight;
  const rects = new Map();
  const tiles = glyphs.map((glyph, index) => {
    const [u0, v0] = glyph.uvRect;
    const tile = {
      sourceX: Math.round(u0 * atlasWidth),
      sourceY: Math.round((1 - v0) * atlasHeight),
      glyphWidth: widths[index],
      glyphHeight: heights[index],
      x: index % columns * cellWidth,
      y: Math.floor(index / columns) * cellHeight,
    };
    rects.set(glyphKey(glyph.uvRect, atlasWidth, atlasHeight), [
      tile.x / width, tile.y / height,
      (tile.glyphWidth + PADDING * 2) / width, (tile.glyphHeight + PADDING * 2) / height,
    ]);
    return tile;
  });
  return { width, height, tiles, rects };
}

/** RGBA coverage blurred at each of GLYPH_BLUR_RADII, from the MSDF atlas pixels. */
export function rasterGlyphCoverage(layout, source, font) {
  const { width, tiles } = layout;
  const data = new Uint8Array(width * layout.height * 4);
  for (const { sourceX, sourceY, glyphWidth, glyphHeight, x, y } of tiles) {
    const tileWidth = glyphWidth + PADDING * 2, tileHeight = glyphHeight + PADDING * 2;
    const coverage = new Float32Array(tileWidth * tileHeight);
    for (let gy = 0; gy < glyphHeight; gy++) {
      for (let gx = 0; gx < glyphWidth; gx++) {
        const offset = ((sourceY + gy) * font.atlasWidth + sourceX + gx) * 4;
        const r = source[offset], g = source[offset + 1], b = source[offset + 2];
        const median = Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
        coverage[(gy + PADDING) * tileWidth + gx + PADDING] =
          Math.max(0, Math.min(1, (median / 255 - 0.5) * font.distanceRange + 0.5));
      }
    }
    GLYPH_BLUR_RADII.forEach((radius, channel) => {
      let blurred = coverage;
      for (let pass = 0; pass < 3; pass++) {
        blurred = boxBlur(blurred, tileWidth, tileHeight, radius, true);
        blurred = boxBlur(blurred, tileWidth, tileHeight, radius, false);
      }
      for (let ty = 0; ty < tileHeight; ty++) {
        for (let tx = 0; tx < tileWidth; tx++) {
          data[((y + ty) * width + x + tx) * 4 + channel] = Math.round(blurred[ty * tileWidth + tx] * 255);
        }
      }
    });
  }
  return data;
}

function readAtlas(font, map) {
  const canvas = new OffscreenCanvas(font.atlasWidth, font.atlasHeight);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(map.image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** `baked`: planes from `npm run textures:bake` for the same font and glyphs. */
export function createGlyphCoverageAtlas(font, map, selectedGlyphs = [...font.glyphs.values()], baked = null) {
  const layout = layoutGlyphCoverage(font, selectedGlyphs);
  const data = (baked && decodePlanes(baked, layout.width, layout.height, 4))
    ?? rasterGlyphCoverage(layout, readAtlas(font, map), font);
  const texture = new THREE.DataTexture(data, layout.width, layout.height);
  texture.name = "Prefiltered glyph coverage";
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, padding: PADDING, rects: layout.rects, key: rect => glyphKey(rect, font.atlasWidth, font.atlasHeight) };
}
