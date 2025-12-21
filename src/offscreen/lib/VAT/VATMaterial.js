import * as THREE from "three/webgpu";
import {
  Fn,
  uniform,
  texture,
  vec2,
  vec3,
  vec4,
  float,
  floor,
  fract,
  mix,
  select,
  attribute,
  positionLocal,
  uv,
} from "three/tsl";

/**
 * VAT (Vertex Animation Texture) Material
 *
 * Extends MeshStandardNodeMaterial with vertex animation from EXR textures.
 *
 * @example
 * const material = new VATMaterial({
 *   vatTexture,
 *   remapInfo,
 *   color: 0xff6b6b,
 *   roughness: 0.4,
 * });
 */
export class VATMaterial extends THREE.MeshStandardNodeMaterial {
  constructor(options = {}) {
    const {
      vatTexture,
      remapInfo,
      fps = 30,
      debug = false,
      ...materialOptions
    } = options;

    super(materialOptions);

    this.vatTexture = vatTexture;
    this.remapInfo = remapInfo;
    this.fps = fps;
    this.debug = debug;

    // Uniforms
    this.timeUniform = uniform(0.0);
    this.speedUniform = uniform(1.0);
    this.loopUniform = uniform(1.0); // 1.0 = loop, 0.0 = clamp
    this.interpolateUniform = uniform(1.0); // 1.0 = interpolate between frames

    // Texture info uniforms
    this.textureWidthUniform = uniform(vatTexture.image.width);
    this.textureHeightUniform = uniform(vatTexture.image.height);
    this.frameCountUniform = uniform(remapInfo.frames);

    // VAT vertex count (number of unique vertices in VAT texture)
    this.vatVertexCountUniform = uniform(
      remapInfo.vatVertexCount || vatTexture.image.width
    );

    // Remap bounds uniforms
    this.minBoundsUniform = uniform(remapInfo.min);
    this.maxBoundsUniform = uniform(remapInfo.max);

    // Internal state
    this._playing = true;
    this._time = 0;
    this._duration = remapInfo.frames / fps;

    // Setup the position node for VAT animation
    this._setupPositionNode();

    // Debug mode: visualize VAT samples as colors
    if (debug) {
      this._setupDebugColorNode();
    }
  }

  /**
   * Debug: output VAT sample values as vertex colors
   */
  _setupDebugColorNode() {
    const vatTex = texture(this.vatTexture);
    const timeU = this.timeUniform;
    const frameCount = this.frameCountUniform;

    this.colorNode = Fn(() => {
      const vatUV = uv(1);
      const frame = floor(timeU.mul(frameCount));
      const timeInFrames = frame.div(frameCount);
      const texV = float(1.0).sub(timeInFrames).sub(float(1.0).sub(vatUV.y));
      const sampleUV = vec2(vatUV.x, texV);
      const sample = vatTex.sample(sampleUV).xyz;
      // Visualize offset values - shift to 0-1 range for visibility
      return vec4(sample.add(0.5), float(1.0));
    })();
  }

  /**
   * Setup the vertex position animation node
   * Based on Houdini VAT soft body shader approach
   */
  _setupPositionNode() {
    const vatTex = texture(this.vatTexture);
    const frameCount = this.frameCountUniform;
    const timeU = this.timeUniform;

    this.positionNode = Fn(() => {
      // Get VAT UV from the second UV set (uv1)
      // uv2.x = column in texture (which vertex)
      // uv2.y = used in V calculation
      const vatUV = uv(1);
      // Calculate frame timing (similar to Houdini VAT shader)
      // timeU is normalized 0-1, convert to frame
      const frame = floor(timeU.mul(frameCount));
      const timeInFrames = frame.div(frameCount);

      // Calculate V coordinate for texture sampling
      // Formula from reference: 1.0 - timeInFrames - (1.0 - uv2.y)
      // This accounts for the texture layout where V increases downward
      const texV = float(1.0).sub(timeInFrames).sub(float(1.0).sub(vatUV.y));

      // Sample VAT texture - position offset is stored directly
      const sampleUV = vec2(vatUV.x, texV);
      const texturePos = vatTex.sample(sampleUV).xyz;

      // VAT stores OFFSETS - add to original position
      // The offset is in the same coordinate space as the mesh
      const animatedPosition = positionLocal.add(texturePos);

      return animatedPosition;
    })();
  }

  /**
   * Update the animation time
   * @param {number} delta - Delta time in seconds
   */
  update(delta) {
    if (!this._playing) return;

    this._time += delta * this.speedUniform.value;

    if (this.loopUniform.value > 0.5) {
      // Loop mode
      this._time = this._time % this._duration;
    } else {
      // Clamp mode
      this._time = Math.min(this._time, this._duration);
    }

    // Convert to normalized time (0-1)
    this.timeUniform.value = this._time / this._duration;
  }

  /**
   * Set animation time (normalized 0-1)
   * @param {number} t - Normalized time
   */
  setTime(t) {
    this._time = t * this._duration;
    this.timeUniform.value = Math.max(0, Math.min(1, t));
  }

  /**
   * Set specific frame
   * @param {number} frame - Frame index
   */
  setFrame(frame) {
    const normalizedTime = frame / (this.remapInfo.frames - 1);
    this.setTime(normalizedTime);
  }

  /**
   * Get current frame
   * @returns {number}
   */
  getFrame() {
    return Math.round(this.timeUniform.value * (this.remapInfo.frames - 1));
  }

  /**
   * Play the animation
   */
  play() {
    this._playing = true;
  }

  /**
   * Pause the animation
   */
  pause() {
    this._playing = false;
  }

  /**
   * Check if animation is playing
   * @returns {boolean}
   */
  get playing() {
    return this._playing;
  }

  /**
   * Set playback speed
   * @param {number} speed
   */
  setSpeed(speed) {
    this.speedUniform.value = speed;
  }

  /**
   * Get playback speed
   * @returns {number}
   */
  getSpeed() {
    return this.speedUniform.value;
  }

  /**
   * Set loop mode
   * @param {boolean} loop
   */
  setLoop(loop) {
    this.loopUniform.value = loop ? 1.0 : 0.0;
  }

  /**
   * Get loop mode
   * @returns {boolean}
   */
  getLoop() {
    return this.loopUniform.value > 0.5;
  }

  /**
   * Set frame interpolation
   * @param {boolean} interpolate
   */
  setInterpolate(interpolate) {
    this.interpolateUniform.value = interpolate ? 1.0 : 0.0;
  }

  /**
   * Get animation duration in seconds
   * @returns {number}
   */
  get duration() {
    return this._duration;
  }

  /**
   * Get total frame count
   * @returns {number}
   */
  get frameCount() {
    return this.remapInfo.frames;
  }

  /**
   * Get current normalized time (0-1)
   * @returns {number}
   */
  get time() {
    return this.timeUniform.value;
  }
}
