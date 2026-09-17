import * as THREE from "three/webgpu";

/**
 * WebGPU-compatible GBuffer render target with:
 * - 1 color attachment for albedo
 * - 1 depth texture
 *
 * Note:
 * - Simplified to single color output for broad material compatibility
 * - No allocations in the frame loop. Recreate only on resize.
 */
export class GBuffer {
  constructor(width, height, devicePixelRatio = 1) {
    this._devicePixelRatio = devicePixelRatio;
    this._createTarget(width, height, devicePixelRatio);
  }

  _createTarget(width, height, devicePixelRatio) {
    const w = Math.max(1, Math.floor(width * devicePixelRatio));
    const h = Math.max(1, Math.floor(height * devicePixelRatio));

    // Single color attachment - no MRT to ensure compatibility with all materials
    // MSAA: scenes render offscreen, so canvas antialiasing never applies to
    // them; without samples every edge would be baked in aliased
    this.target = new THREE.RenderTarget(w, h, {
      depthBuffer: true,
      samples: 4,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this.target.texture.name = "output";

    // Depth texture for sampling in post
    this.target.depthTexture = new THREE.DepthTexture(w, h);
    this.target.depthTexture.format = THREE.DepthFormat;
    this.target.depthTexture.type = THREE.UnsignedIntType;
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

