import * as THREE from "three/webgpu";
export { createGlyphCoverageAtlas as createWallFocusAtlas, GLYPH_BLUR_RADII as FOCUS_RADII } from "../../utils/glyphCoverageAtlas.js";

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
