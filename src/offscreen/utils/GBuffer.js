import { HalfFloatType } from "three/webgpu";
import { createRenderTarget } from "./renderTarget.js";

/**
 * WebGPU-compatible GBuffer render target with:
 * - 1 color attachment for albedo
 * - 1 depth texture
 *
 * Note:
 * - Simplified to single color output for broad material compatibility
 * - No allocations in the frame loop. Recreate only on resize.
 * - MSAA defaults to createRenderTarget's shared setting; scenes may override it.
 */
export class GBuffer {
  constructor(width, height, devicePixelRatio = 1, options = {}) {
    this._devicePixelRatio = devicePixelRatio;
    this._options = options;
    this._createTarget(width, height, devicePixelRatio);
  }

  _createTarget(width, height, devicePixelRatio) {
    const w = Math.max(1, Math.floor(width * devicePixelRatio));
    const h = Math.max(1, Math.floor(height * devicePixelRatio));

    // Only the resolved color is sampled, so the MSAA color can stay in tile
    // memory. Scenes that render into their gbuffer more than once per frame
    // or copy it mid-pass (viewport / transmission nodes) must opt out.
    this.target = createRenderTarget(w, h, {
      type: HalfFloatType,
      depthTexture: true,
      storeMultisampledColorBuffer: false,
      ...this._options,
    });
    this.target.texture.name = "output";
  }

  get albedo() {
    return this.target.texture;
  }

  get normals() {
    // No longer available - return null for compatibility
    return null;
  }

  get depth() {
    return this.target.depthTexture;
  }

  resize(width, height, devicePixelRatio = this._devicePixelRatio) {
    this._devicePixelRatio = devicePixelRatio;
    // Keep texture identities stable so prepared composite materials survive resize.
    this.target.setSize(
      Math.max(1, Math.floor(width * devicePixelRatio)),
      Math.max(1, Math.floor(height * devicePixelRatio)),
    );
  }

  dispose() {
    this.albedo?.dispose();
    this.depth?.dispose();
    this.target?.dispose();
  }
}
