import * as THREE from "three/webgpu";
import { renderSetting } from "@/shared/tiers.js";

/**
 * Create an offscreen RenderTarget with the device tier's MSAA and optional
 * depth. Canvas `antialias` never reaches scene / reflection targets.
 * Call sites inherit `samples` unless they pass an explicit override.
 *
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @param {THREE.TextureDataType} [options.type]
 * @param {boolean} [options.depthBuffer=true]
 * @param {boolean} [options.depthTexture=false] Attach a sampleable DepthTexture
 * @param {number} [options.samples] Defaults to the tier's `msaa`
 * @returns {THREE.RenderTarget}
 */
export function createRenderTarget(width, height, options = {}) {
  const {
    type,
    depthBuffer = true,
    depthTexture = false,
    samples = renderSetting("msaa"),
    minFilter = THREE.LinearFilter,
    magFilter = THREE.LinearFilter,
    ...rest
  } = options;

  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));

  const target = new THREE.RenderTarget(w, h, {
    depthBuffer,
    samples,
    minFilter,
    magFilter,
    ...(type !== undefined ? { type } : {}),
    ...rest,
  });

  if (depthTexture) {
    target.depthTexture = new THREE.DepthTexture(w, h);
    target.depthTexture.format = THREE.DepthFormat;
    target.depthTexture.type = THREE.UnsignedIntType;
  }

  return target;
}
