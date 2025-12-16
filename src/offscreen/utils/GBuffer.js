import * as THREE from "three/webgpu";

/**
 * WebGPU-compatible GBuffer render target with:
 * - 2 color attachments: [0] albedo, [1] normals
 * - 1 depth texture
 *
 * Note:
 * - No allocations in the frame loop. Recreate only on resize.
 * - Formats favor quality with half-float where available.
 */
export class GBuffer {
  constructor(width, height, devicePixelRatio = 1) {
    this._devicePixelRatio = devicePixelRatio;
    this._createTarget(width, height, devicePixelRatio);
  }

  _createTarget(width, height, devicePixelRatio) {
    const w = Math.max(1, Math.floor(width * devicePixelRatio));
    const h = Math.max(1, Math.floor(height * devicePixelRatio));

    // Create MRT with two color attachments
    this.target = new THREE.RenderTarget(w, h, {
      count: 2,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // Name attachments for MRT mapping
    this.target.textures[0].name = "output";
    this.target.textures[1].name = "normal";

    // Depth texture for sampling in post
    this.target.depthTexture = new THREE.DepthTexture(w, h);
    this.target.depthTexture.format = THREE.DepthFormat;
    this.target.depthTexture.type = THREE.UnsignedIntType;
  }

  get albedo() {
    return this.target.textures[0];
  }

  get normals() {
    return this.target.textures[1];
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
    this.normals?.dispose();
    this.depth?.dispose();
    this.target?.dispose();
  }
}
