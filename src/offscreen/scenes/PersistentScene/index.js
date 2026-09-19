import * as THREE from "three/webgpu";
import { NodeMaterial, HalfFloatType } from "three/webgpu";
import { uniform } from "three/tsl";
import { createRenderTarget } from "../../utils/renderTarget.js";
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
    const target = createRenderTarget(w, h, {
      type: HalfFloatType,
      depthTexture: true,
    });

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
   * Create render target for screen with depth.
   * Full resolution, no MSAA: the screen is a flat quad (nothing to
   * antialias inside), and a half-res MSAA resolve upscaled + depth-tested
   * against full-res pixels produced crawling artifacts on its edges.
   */
  _createScreenTarget(width, height, devicePixelRatio) {
    const w = Math.max(1, Math.floor(width * devicePixelRatio));
    const h = Math.max(1, Math.floor(height * devicePixelRatio));

    this.screenTarget = createRenderTarget(w, h, {
      type: HalfFloatType,
      depthTexture: true,
      samples: 0,
    });
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
    // Old-portfolio Wall tiles: RoundedBox(size, size, size * 0.2, 1)
    this.grid = new Grid({
      // Old Wall: 34×16, tile 1, gap 0.1, shifted up so the floor sits below
      cols: 34,
      rows: 16,
      tileSize: 1,
      gap: 0.1,
      cornerRadius: 0.1,
      depth: 0.2,
      activeTiles: [
        [0.35, 0.55],
        [0.55, 0.45],
        [0.68, 0.6],
      ],
      pushStrength: 0.2,
      pushZ: 2.0,
      hoverLift: 2.0,
      rotationStrength: 1.4,
      displacement: 0.22,
      color: 0xffffff,
      opacity: 1,
      renderer: this.renderer,
      position: new THREE.Vector3(0, 2, 0),
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
    this.screenPlane.position.z = -1.5;
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
          ", ",
        )}`,
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
   * Fit the screen plane inside the grid footprint. The screen must stay
   * smaller than the tiles so it never peeks out around the edges (old wall
   * screen was ~80–90% of the wall). Perspective-correct so the inset holds
   * even though the plane sits behind the grid.
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} padding - Visual size relative to the grid (< 1)
   */
  _fitScreenToGrid(camera, padding = 0.85) {
    if (!this.screenPlane || !this.grid) return;

    const dims = this.grid.getDimensions();
    if (!(dims.width > 0) || !(dims.height > 0)) return;

    const inset = Math.min(padding, 0.95);

    let scale = 1;
    if (camera?.isPerspectiveCamera) {
      this.grid.getWorldPosition(this._gridWorldPos);

      // Place the plane center on the camera → grid-center ray so it stays
      // visually centered behind the grid regardless of camera position
      const planeZ = this.screenPlane.position.z;
      const dz = this._gridWorldPos.z - camera.position.z;
      if (Math.abs(dz) > 1e-6) {
        const t = (planeZ - camera.position.z) / dz;
        this.screenPlane.position.x =
          camera.position.x + (this._gridWorldPos.x - camera.position.x) * t;
        this.screenPlane.position.y =
          camera.position.y + (this._gridWorldPos.y - camera.position.y) * t;
        // Same ratio scales the plane so it hugs the grid footprint
        if (t > 0) scale = t;
      }
    }

    this.screenPlane.scale.set(
      dims.width * scale * inset,
      dims.height * scale * inset,
      1,
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
