import * as THREE from "three/webgpu";

// Four Gaussian approximations packed into RGBA. Generated once at wall
// creation, never in the render loop; all glyphs share this one atlas.
export const FOCUS_RADII = [1, 3, 7, 14];
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

export function createWallFocusAtlas(font, map) {
  const canvas = new OffscreenCanvas(font.atlasWidth, font.atlasHeight);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(map.image, 0, 0);
  const source = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const glyphs = [...font.glyphs.values()].filter(g => g.uvRect[2] > g.uvRect[0]);
  const columns = Math.ceil(Math.sqrt(glyphs.length));
  const widths = glyphs.map(g => Math.round((g.uvRect[2] - g.uvRect[0]) * canvas.width));
  const heights = glyphs.map(g => Math.round(Math.abs(g.uvRect[3] - g.uvRect[1]) * canvas.height));
  const cellWidth = Math.max(...widths) + PADDING * 2;
  const cellHeight = Math.max(...heights) + PADDING * 2;
  const width = columns * cellWidth;
  const height = Math.ceil(glyphs.length / columns) * cellHeight;
  const data = new Uint8Array(width * height * 4);
  const rects = new Map();

  glyphs.forEach((glyph, index) => {
    const [u0, v0] = glyph.uvRect;
    const sourceX = Math.round(u0 * canvas.width);
    const sourceY = Math.round((1 - v0) * canvas.height);
    const glyphWidth = widths[index], glyphHeight = heights[index];
    const tileWidth = glyphWidth + PADDING * 2, tileHeight = glyphHeight + PADDING * 2;
    const x = index % columns * cellWidth, y = Math.floor(index / columns) * cellHeight;
    const coverage = new Float32Array(tileWidth * tileHeight);
    for (let gy = 0; gy < glyphHeight; gy++) {
      for (let gx = 0; gx < glyphWidth; gx++) {
        const offset = ((sourceY + gy) * canvas.width + sourceX + gx) * 4;
        const r = source[offset], g = source[offset + 1], b = source[offset + 2];
        const median = Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
        coverage[(gy + PADDING) * tileWidth + gx + PADDING] =
          Math.max(0, Math.min(1, (median / 255 - 0.5) * font.distanceRange + 0.5));
      }
    }
    FOCUS_RADII.forEach((radius, channel) => {
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
    rects.set(glyphKey(glyph.uvRect, canvas.width, canvas.height),
      [x / width, y / height, tileWidth / width, tileHeight / height]);
  });

  const texture = new THREE.DataTexture(data, width, height);
  texture.name = "About prefiltered glyph coverage";
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, padding: PADDING, rects, key: rect => glyphKey(rect, canvas.width, canvas.height) };
}

// BatchedMSDFText repacks attributes on layout changes. Refresh our UV lookup
// only when that happens, preserving its existing member/layout machinery.
export function bindWallFocusAtlas(batch, atlas) {
  const beforeRender = batch.onBeforeRender;
  let sourceVersion = -1, previousGeometry = null;
  batch.onBeforeRender = function (...args) {
    beforeRender.apply(this, args);
    const source = this.geometry.getAttribute("msdfUvRect");
    if (source.version === sourceVersion && this.geometry === previousGeometry) return;
    let target = this.geometry.getAttribute("wallFocusRect");
    if (!target || target.count !== source.count) {
      target = new THREE.InstancedBufferAttribute(new Float32Array(source.count * 4), 4);
      this.geometry.setAttribute("wallFocusRect", target);
    }
    for (let i = 0; i < this.geometry.instanceCount; i++) {
      const rect = atlas.rects.get(atlas.key(source.array.subarray(i * 4, i * 4 + 4)));
      if (rect) target.setXYZW(i, ...rect);
    }
    target.needsUpdate = true;
    sourceVersion = source.version;
    previousGeometry = this.geometry;
  };
  return () => {
    batch.onBeforeRender = beforeRender;
    atlas.texture.dispose();
  };
}
