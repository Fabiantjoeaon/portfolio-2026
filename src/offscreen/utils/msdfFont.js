import * as THREE from "three/webgpu";
import { parseMSDFFont } from "three-blocks/msdf-text";
import { resolvePublicPath } from "./publicPath.js";

const FONT_JSON = "assets/fonts/msdf/KHTeka/KHTekaTRIAL-Medium-msdf.json";
const FONT_ATLAS = "assets/fonts/msdf/KHTeka/KHTekaTRIAL-Medium.png";

let fontPromise = null;

async function loadAtlas(url) {
  if (typeof window === "undefined") {
    // The WebGPU backend honors texture.flipY when uploading ImageBitmaps,
    // so keep the bitmap unflipped to match TextureLoader semantics
    const bitmap = await new THREE.ImageBitmapLoader().loadAsync(url);
    const texture = new THREE.Texture(bitmap);
    texture.flipY = true;
    texture.needsUpdate = true;
    return texture;
  }
  return new THREE.TextureLoader().loadAsync(url);
}

/**
 * Shared KHTeka MSDF font + atlas, loaded once and cached. Used by every
 * BatchedMSDFText in the app (grid overlay labels, about text wall).
 * @returns {Promise<{ font: import('three-blocks/msdf-text').MSDFFont, map: THREE.Texture }>}
 */
export function loadMSDFFont() {
  if (!fontPromise) {
    fontPromise = Promise.all([
      fetch(resolvePublicPath(FONT_JSON)).then((r) => r.json()),
      loadAtlas(resolvePublicPath(FONT_ATLAS)),
    ]).then(([json, map]) => {
      const font = parseMSDFFont(json, { flipY: true });
      // The KHTeka atlas has no space glyph; without it the layout falls
      // back to '?'. A zero-area glyph with an advance renders as a gap.
      if (!font.has(32)) {
        font.glyphs.set(32, {
          advance: 0.28,
          planeBounds: [0, 0, 0, 0],
          uvRect: [0, 0, 0, 0],
        });
      }
      return { font, map };
    });
  }
  return fontPromise;
}
