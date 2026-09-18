import { createRenderTarget } from "./renderTarget.js";

/**
 * WebGPU-compatible GBuffer render target with:
 * - 1 color attachment for albedo
 * - 1 depth texture
 *
 * Note:
 * - Simplified to single color output for broad material compatibility
 * - No allocations in the frame loop. Recreate only on resize.
 * - MSAA comes from createRenderTarget (shared with every other scene target).
 */
export class GBuffer {
  constructor(width, height, devicePixelRatio = 1) {
    this._devicePixelRatio = devicePixelRatio;
    this._createTarget(width, height, devicePixelRatio);
  }

  _createTarget(width, height, devicePixelRatio) {
    const w = Math.max(1, Math.floor(width * devicePixelRatio));
    const h = Math.max(1, Math.floor(height * devicePixelRatio));

    this.target = createRenderTarget(w, h, { depthTexture: true });
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
    this.dispose();
    this._createTarget(width, height, devicePixelRatio);
  }

  dispose() {
    this.albedo?.dispose();
    this.depth?.dispose();
    this.target?.dispose();
  }
}

