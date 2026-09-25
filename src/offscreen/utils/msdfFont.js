import * as THREE from "three/webgpu";
import { parseMSDFFont } from "three-blocks/msdf-text";
import { resolvePublicPath } from "./publicPath.js";

const FONT_JSON = "assets/fonts/msdf/SpaceMono/SpaceMono-Regular-msdf.json";
const FONT_ATLAS = "assets/fonts/msdf/SpaceMono/SpaceMono-Regular.png";

const fontPromises = new Map();

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
 * Shared Space Mono MSDF font + atlas, loaded once and cached. Used by every
 * BatchedMSDFText in the app (grid overlay labels, about text wall).
 * @returns {Promise<{ font: import('three-blocks/msdf-text').MSDFFont, map: THREE.Texture }>}
 */
export function loadMSDFFont({ jsonPath = FONT_JSON, atlasPath = FONT_ATLAS } = {}) {
  const key = `${jsonPath}|${atlasPath}`;
  if (!fontPromises.has(key)) {
    const fontPromise = Promise.all([
      fetch(resolvePublicPath(jsonPath)).then((r) => r.json()),
      loadAtlas(resolvePublicPath(atlasPath)),
    ]).then(([json, map]) => {
      const font = parseMSDFFont(json, { flipY: true });
      return { font, map };
    });
    fontPromises.set(key, fontPromise);
  }
  return fontPromises.get(key);
}
