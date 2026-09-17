import * as THREE from "three/webgpu";
import { NodeMaterial, RenderTarget, HalfFloatType } from "three/webgpu";
import { uniform } from "three/tsl";
import { Grid } from "./Grid/index.js";
import { SCREEN_SHADERS, getAvailableShaders } from "./screenShaders.js";

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
    this.gbuffer = null; // Will be created as simple render target
    this.grid = null;
    this.screenPlane = null;

    // Create simple render target for persistent scene (single color output)
    this._createGBuffer(width, height, devicePixelRatio);

    // Create screen render target
    this._createScreenTarget(width, height, devicePixelRatio);

    // Preallocated temps for screen-fitting math
    this._planeWorldPos = new THREE.Vector3();
    this._gridWorldPos = new THREE.Vector3();
    this._camDir = new THREE.Vector3();

    // Initialize screen plane (in screenScene)
    this._setupScreen();

    // Initialize grid (in main scene)
    this._setupGrid();
  }

  /**
   * Create simple render target for persistent scene (single color attachment)
   * Unlike the full GBuffer, this doesn't need MRT since tiles only output color
   */
  _createGBuffer(width, height, devicePixelRatio) {
    const w = Math.max(1, Math.floor(width * devicePixelRatio));
    const h = Math.max(1, Math.floor(height * devicePixelRatio));

    // Simple render target with single color attachment
    const target = new RenderTarget(w, h, {
      type: HalfFloatType,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // Add depth texture for post-processing depth compositing
    target.depthTexture = new THREE.DepthTexture(w, h);
    target.depthTexture.format = THREE.DepthFormat;
    target.depthTexture.type = THREE.UnsignedIntType;

    // Create gbuffer-like interface for compatibility with SceneManager
    this.gbuffer = {
      target,
      get albedo() {
        return target.texture;
      },
      get depth() {
        return target.depthTexture;
      },
      resize: (w, h, dpr) => {
        target.dispose();
        this._createGBuffer(w, h, dpr);
      },
      dispose: () => {
        target.texture?.dispose();
        target.depthTexture?.dispose();
        target.dispose();
      },
    };
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
    // Old-portfolio proportions: flat square tiles (depth 0.2x size)
    // with barely rounded corners
    this.grid = new Grid({
      size: 28, // Number of columns (rows auto-calculated from aspect ratio)
      gap: 0.15, // Fraction of the cell
      cornerRadius: 0.1, // Fraction of tile size
      depth: 0.2, // Fraction of tile size
      bevel: {
        enabled: true,
        thickness: 0.03, // Fraction of tile size
        size: 0.02, // Fraction of tile size
        segments: 1,
      },
      // Interactive tiles (normalized grid positions), like old project tiles
      activeTiles: [
        [0.35, 0.55],
        [0.55, 0.45],
        [0.68, 0.6],
      ],
      pushStrength: 0.2, // How far tiles push away from the mouse
      pushZ: 2.0, // Z push-back under mouse influence
      hoverLift: 2.0, // Z pop height of the hovered active tile
      color: 0xffffff,
      opacity: 1,
      renderer: this.renderer,
      position: new THREE.Vector3(0, 0, -5), // Behind other content
    });

    this.scene.add(this.grid);
  }

  /**
   * Setup the screen plane with swappable shaders
   * Default shader: 'noise-glow'
   */
  _setupScreen(shaderName = "noise-glow") {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new NodeMaterial();
    material.transparent = true;

    // Shared uniforms across all shaders
    this._screenUniforms = {
      uIsIntro: uniform(0.0),
      uIntroHovered: uniform(0.0),
      uHoverTransition: uniform(0.0),
    };

    // Store geometry and material for shader swapping
    this._screenGeometry = geometry;
    this._screenMaterial = material;
    this._currentShaderName = shaderName;

    // Apply initial shader
    this._applyScreenShader(shaderName);

    this.screenPlane = new THREE.Mesh(geometry, material);
    this.screenPlane.position.z = -6.5;
    this.screenScene.add(this.screenPlane);
  }

  /**
   * Apply a shader to the screen plane by name
   * @param {string} shaderName - Name of shader ('noise-glow', 'gradient', 'plasma', 'solid')
   * @returns {boolean} - True if shader was applied successfully
   */
  _applyScreenShader(shaderName) {
    const shaderFactory = SCREEN_SHADERS[shaderName];
    if (!shaderFactory) {
      console.warn(
        `Screen shader "${shaderName}" not found. Available: ${getAvailableShaders().join(
          ", "
        )}`
      );
      return false;
    }

    const { colorNode } = shaderFactory(this._screenUniforms);
    this._screenMaterial.colorNode = colorNode;
    this._screenMaterial.needsUpdate = true;
    this._currentShaderName = shaderName;
    return true;
  }

  /**
   * Switch the screen plane shader at runtime
   * @param {string} shaderName - Name of shader to switch to
   * @returns {boolean} - True if switch was successful
   */
  setScreenShader(shaderName) {
    if (!this._screenMaterial) {
      console.warn("Screen plane not initialized yet");
      return false;
    }
    return this._applyScreenShader(shaderName);
  }

  /**
   * Get the current screen shader name
   * @returns {string}
   */
  getScreenShaderName() {
    return this._currentShaderName;
  }

  /**
   * Get list of available screen shaders
   * @returns {string[]}
   */
  getAvailableScreenShaders() {
    return getAvailableShaders();
  }

  /**
   * Get screen shader uniforms for external control
   * @returns {Object} - { uIsIntro, uIntroHovered, uHoverTransition }
   */
  getScreenUniforms() {
    return this._screenUniforms;
  }

  /**
   * Fit the screen plane to the grid footprint (like the old wall screen:
   * wall dimensions plus a margin), adapting to viewport-driven grid rebuilds.
   * The grid rectangle is projected onto the screen plane through the camera
   * so the backdrop visually hugs the grid despite sitting behind it.
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} padding - Relative margin around the grid
   */
  _fitScreenToGrid(camera, padding = 1.15) {
    if (!this.screenPlane || !this.grid) return;

    const dims = this.grid.getDimensions();
    if (!(dims.width > 0) || !(dims.height > 0)) return;

    // Perspective correction: how much bigger the plane must be at its depth
    // to cover the same view area as the grid at the grid's depth
    let scale = 1;
    if (camera?.isPerspectiveCamera) {
      this.screenPlane.getWorldPosition(this._planeWorldPos);
      this.grid.getWorldPosition(this._gridWorldPos);
      camera.getWorldDirection(this._camDir);

      const dScreen = this._planeWorldPos.sub(camera.position).dot(this._camDir);
      const dGrid = this._gridWorldPos.sub(camera.position).dot(this._camDir);
      if (dScreen > 0 && dGrid > 0) {
        scale = dScreen / dGrid;
      }
    }

    this.screenPlane.scale.set(
      dims.width * scale * padding,
      dims.height * scale * padding,
      1
    );
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

  update(time, delta, camera = null) {
    if (this.testObject) {
      this.testObject.rotation.x = time * 0.0005;
      this.testObject.rotation.y = time * 0.001;
    }

    // Update grid compute shader (camera used for pointer projection)
    if (this.grid) {
      this.grid.update(time, delta, camera);
    }
  }

  /**
   * Render the screen to its own render target
   * Call this BEFORE rendering active scenes so tiles can sample it
   * @param {THREE.Camera} camera - The camera to render with
   */
  renderScreen(camera) {
    if (!this.screenTarget || !this.renderer) return;

    // Keep the screen plane fitted to the grid footprint
    this._fitScreenToGrid(camera);

    // Keep glass tiles sampling the latest screen texture
    // (cheap uniform assignment; survives grid rebuilds and target resizes)
    if (this.grid) {
      this.grid.setScreenTexture(this.screenTexture);
    }

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

    // Screen plane size is fitted to the camera every frame in renderScreen
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
