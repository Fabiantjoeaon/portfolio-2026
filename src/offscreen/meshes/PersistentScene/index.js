import * as THREE from "three/webgpu";
import { NodeMaterial, RenderTarget, HalfFloatType } from "three/webgpu";
import {
  uniform,
  uv,
  vec3,
  vec4,
  float,
  sin,
  cos,
  mix,
  time,
  Fn,
} from "three/tsl";
import { Grid } from "./Grid/index.js";
import { GBuffer } from "../../utils/GBuffer.js";

/**
 * Manages objects that persist across all scenes.
 * These objects are rendered into their own gbuffer and composited
 * with depth testing to maintain proper occlusion.
 *
 * The screen plane is rendered separately so glass tiles can sample it.
 */
export default class PersistentScene {
  /**
   * @param {THREE.WebGPURenderer} renderer - WebGPU renderer for compute shaders
   * @param {number} width - Viewport width
   * @param {number} height - Viewport height
   * @param {number} devicePixelRatio - Device pixel ratio
   */
  constructor(renderer, width, height, devicePixelRatio = 1) {
    this.renderer = renderer;
    this._devicePixelRatio = devicePixelRatio;
    this._viewportWidth = width;
    this._viewportHeight = height;

    // Main scene for foreground elements (grid tiles)
    this.scene = new THREE.Scene();

    // Separate scene for screen/background plane (rendered first, sampled by tiles)
    this.screenScene = new THREE.Scene();

    this.testObject = null;
    this.gbuffer = new GBuffer(width, height, devicePixelRatio);
    this.grid = null;
    this.screenPlane = null;

    // Create screen render target
    this._createScreenTarget(width, height, devicePixelRatio);

    // Initialize screen plane (in screenScene)
    this._setupScreen();

    // Initialize grid (in main scene)
    this._setupGrid();
  }

  /**
   * Create render target for screen with depth
   */
  _createScreenTarget(width, height, devicePixelRatio) {
    const w = Math.max(1, Math.floor(width * devicePixelRatio));
    const h = Math.max(1, Math.floor(height * devicePixelRatio));

    this.screenTarget = new RenderTarget(w, h, {
      type: HalfFloatType,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // Add depth texture for sampling in post-processing
    this.screenTarget.depthTexture = new THREE.DepthTexture(w, h);
    this.screenTarget.depthTexture.format = THREE.DepthFormat;
    this.screenTarget.depthTexture.type = THREE.UnsignedIntType;
  }

  /**
   * Get the screen texture for sampling
   * @returns {THREE.Texture}
   */
  get screenTexture() {
    return this.screenTarget?.texture ?? null;
  }

  /**
   * Get the screen depth texture for depth compositing
   * @returns {THREE.DepthTexture}
   */
  get screenDepth() {
    return this.screenTarget?.depthTexture ?? null;
  }

  /**
   * Setup the GPU-driven grid
   */
  _setupGrid() {
    this.grid = new Grid({
      size: 16, // Number of columns (rows auto-calculated from aspect ratio)
      gap: 0.37,
      cornerRadius: 0.08,
      depth: 0.08,
      bevel: {
        enabled: true,
        thickness: 0.1,
        size: 0.085,
        segments: 1,
      },
      color: 0xffffff,
      opacity: 1,
      renderer: this.renderer,
      position: new THREE.Vector3(0, 0, -5), // Behind other content
    });

    // Update screen plane when grid rebuilds (viewport resize, etc.)
    this.grid.onRebuild((dimensions) => {
      this._updateScreenSize(dimensions);
    });

    // Initial screen size update - get dimensions from grid or use viewport
    const gridDimensions = this.grid.getDimensions();
    if (gridDimensions.width > 0 && gridDimensions.height > 0) {
      this._updateScreenSize(gridDimensions);
    } else {
      // Fallback: use viewport dimensions converted to world units
      this._updateScreenSizeFromViewport();
    }

    this.scene.add(this.grid);
  }

  /**
   * Setup the animated gradient screen plane
   */
  _setupScreen() {
    // Create plane geometry (will be scaled to match grid)
    const geometry = new THREE.PlaneGeometry(1, 1);

    // Create material with animated gradient shader
    const material = new NodeMaterial();
    material.transparent = true;

    // Gradient colors - can be customized
    const color1 = uniform(new THREE.Color(0x1a1f3c)); // Deep blue-purple
    const color2 = uniform(new THREE.Color(0x0d1129)); // Dark navy
    const color3 = uniform(new THREE.Color(0x151b33)); // Midnight blue
    const speed = uniform(0.3);

    material.colorNode = Fn(() => {
      const uvCoord = uv();

      // Create animated wave pattern
      const wave1 = sin(uvCoord.y.mul(3.0).add(time.mul(speed)))
        .mul(0.5)
        .add(0.5);
      const wave2 = cos(uvCoord.x.mul(2.0).sub(time.mul(speed.mul(0.7))))
        .mul(0.5)
        .add(0.5);

      // Combine waves for organic movement
      const blend = wave1.mul(0.6).add(wave2.mul(0.4));

      // Create diagonal gradient base
      const diagonal = uvCoord.x.add(uvCoord.y).mul(0.5);

      // Mix colors based on position and animation
      const mixedColor1 = mix(vec3(color1), vec3(color2), diagonal);
      const mixedColor2 = mix(vec3(color2), vec3(color3), blend);
      const finalColor = mix(
        mixedColor1,
        mixedColor2,
        blend.mul(0.5).add(0.25),
      );

      return vec4(finalColor, float(1.0));
    })();

    // Store uniforms for external access
    material.uniforms = {
      color1,
      color2,
      color3,
      speed,
    };

    this.screenPlane = new THREE.Mesh(geometry, material);
    this.screenPlane.position.z = -6.5; // Behind the grid (grid is at z=-5)
    // Add to separate screen scene (not main scene)
    this.screenScene.add(this.screenPlane);
  }

  /**
   * Fallback for updating screen size from viewport
   */
  _updateScreenSizeFromViewport() {
    if (!this.screenPlane) return;

    const worldWidth = this._viewportWidth * 0.01;
    const worldHeight = this._viewportHeight * 0.01;

    // Ensure screen is large enough to fill the view
    const minDimension = 30;
    const screenWidth = Math.max(worldWidth + 2, minDimension);
    const screenHeight = Math.max(worldHeight + 2, minDimension);

    this.screenPlane.scale.set(screenWidth, screenHeight, 1);
  }

  /**
   * Update screen plane to match grid dimensions
   * @param {{ width: number, height: number }} dimensions - Grid dimensions
   * @param {number} padding - Extra padding around the grid
   */
  _updateScreenSize(dimensions, padding = 1.3) {
    if (!this.screenPlane) return;

    // Fallback to viewport if dimensions are invalid
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      this._updateScreenSizeFromViewport();
      return;
    }

    const { width, height } = dimensions;

    // Calculate aspect ratio from grid dimensions
    const gridAspect = width / height;

    // Ensure screen is large enough to fill the view
    // At z=-6.5 from camera at z=5 with 75deg FOV, we need ~20+ units
    const minDimension = 30;

    // Use the larger of grid dimensions or minimum, maintaining aspect ratio
    let screenWidth, screenHeight;
    if (width >= height) {
      screenWidth = Math.max(width + padding * 2, minDimension);
      screenHeight = screenWidth / gridAspect;
    } else {
      screenHeight = Math.max(height + padding * 2, minDimension);
      screenWidth = screenHeight * gridAspect;
    }

    this.screenPlane.scale.set(screenWidth, screenHeight, 1);
  }

  /**
   * Add an object to the persistent scene
   */
  add(object) {
    this.scene.add(object);
  }

  /**
   * Remove an object from the persistent scene
   */
  remove(object) {
    this.scene.remove(object);
  }

  /**
   * Clear all objects from the persistent scene
   */
  clear() {
    this.scene.clear();
  }

  /**
   * Check if the persistent scene is empty
   */
  isEmpty() {
    return this.scene.children.length === 0;
  }

  update(time, delta) {
    if (this.testObject) {
      this.testObject.rotation.x = time * 0.0005;
      this.testObject.rotation.y = time * 0.001;
    }

    // Update grid compute shader
    if (this.grid) {
      this.grid.update(time, delta);
    }
  }

  /**
   * Render the screen to its own render target
   * Call this BEFORE rendering active scenes so tiles can sample it
   * @param {THREE.Camera} camera - The camera to render with
   */
  renderScreen(camera) {
    if (!this.screenTarget || !this.renderer) return;

    const currentTarget = this.renderer.getRenderTarget();
    const currentAutoClear = this.renderer.autoClear;

    this.renderer.setRenderTarget(this.screenTarget);
    this.renderer.autoClear = true;
    // Clear with transparent - only the gradient plane will have color
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.screenScene, camera);

    this.renderer.setRenderTarget(currentTarget);
    this.renderer.autoClear = currentAutoClear;
  }

  /**
   * Resize render targets
   * @param {number} width
   * @param {number} height
   * @param {number} devicePixelRatio
   */
  resize(width, height, devicePixelRatio = this._devicePixelRatio) {
    this._devicePixelRatio = devicePixelRatio;
    this._viewportWidth = width;
    this._viewportHeight = height;

    // Resize screen target
    if (this.screenTarget) {
      this.screenTarget.dispose();
    }

    this._createScreenTarget(width, height, devicePixelRatio);

    // Resize gbuffer
    if (this.gbuffer) {
      this.gbuffer.resize(width, height, devicePixelRatio);
    }

    // Update screen plane size - grid will handle its own resize via viewport store
    // We update from viewport in case grid hasn't resized yet
    if (this.grid) {
      const dimensions = this.grid.getDimensions();
      if (dimensions.width > 0 && dimensions.height > 0) {
        this._updateScreenSize(dimensions);
      }
    }
  }

  /**
   * Set the scene texture for glass effect sampling
   * @param {THREE.Texture} texture - The active scene's albedo texture
   */
  setSceneTexture(texture) {
    if (this.grid) {
      this.grid.setSceneTexture(texture);
    }
  }

  /**
   * Set the scene depth texture for depth-based compositing
   * @param {THREE.Texture} texture - The scene depth texture
   */
  setSceneDepth(texture) {
    if (this.grid) {
      this.grid.setSceneDepth(texture);
    }
  }

  /**
   * Set the screen texture for glass effect sampling
   * @param {THREE.Texture} texture - The screen texture (or null to use internal)
   */
  setScreenTexture(texture = null) {
    if (this.grid) {
      // Use provided texture or fall back to internal screen render
      this.grid.setScreenTexture(texture ?? this.screenTexture);
      // Also pass screen depth for depth-based compositing
      this.grid.setScreenDepth(this.screenDepth);
    }
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    if (this.grid) {
      this.grid.dispose();
      this.grid = null;
    }

    if (this.screenPlane) {
      this.screenPlane.geometry.dispose();
      this.screenPlane.material.dispose();
      this.screenScene.remove(this.screenPlane);
      this.screenPlane = null;
    }

    if (this.screenTarget) {
      this.screenTarget.dispose();
      this.screenTarget = null;
    }

    if (this.gbuffer) {
      this.gbuffer.dispose();
      this.gbuffer = null;
    }
  }
}
