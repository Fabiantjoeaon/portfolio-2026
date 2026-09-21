import * as THREE from "three/webgpu";
import { NodeMaterial, HalfFloatType } from "three/webgpu";
import {
  uniform,
  vec2,
  vec4,
  float,
  texture as textureNode,
} from "three/tsl";
import dispatcher from "@/shared/dispatcher";
import { createRenderTarget } from "../../utils/renderTarget.js";
import { resolvePublicPath } from "../../utils/publicPath.js";
import { ScreenLight } from "../../lighting/screenLight/ScreenLight.js";
import { Grid } from "./Grid/index.js";
import { SCREEN_SHADERS, getAvailableShaders } from "./screenShaders.js";
import {
  SCREEN_TRANSITIONS,
  getAvailableTransitions,
} from "./screenTransitions.js";
import {
  bindParamGroup,
  getDebugFolder,
} from "@/offscreen/debug/bindDebugParams";
import { params, paramValues } from "@/offscreen/params";
import { PROJECTS } from "@/shared/projects";

const persistent = paramValues(params.PersistentScene);

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

    // Textured LTC area light driven by the screen plane; scenes opt in via
    // screenLight.applyTo(material, ...)
    this.screenLight = new ScreenLight({
      lightTexture: this.screenTexture,
      intensity: persistent.screenLightIntensity,
      blur: persistent.screenLightBlur,
      color: persistent.screenLightColor,
    });

    // Preallocated temps for screen-fitting math
    this._planeWorldPos = new THREE.Vector3();
    this._gridWorldPos = new THREE.Vector3();
    this._camDir = new THREE.Vector3();

    // Initialize screen plane (in screenScene)
    this._setupScreen(persistent.screenShader);

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
      cols: persistent.cols,
      rows: persistent.rows,
      tileSize: persistent.tileSize,
      gap: persistent.gap,
      cornerRadius: persistent.cornerRadius,
      depth: persistent.depth,
      projects: PROJECTS,
      hideSpread: persistent.tilesOutSpread,
      pushStrength: persistent.pushStrength,
      pushZ: persistent.pushZ,
      hoverLift: persistent.hoverLift,
      rotationStrength: persistent.rotationStrength,
      mouseSize: persistent.mouseSize,
      idleAmplitude: persistent.idleAmplitude,
      idleSpeed: persistent.idleSpeed,
      displacement: persistent.displacement,
      chromaticAberration: persistent.chromaticAberration,
      refractStrength: persistent.refractStrength,
      fresnelIntensity: persistent.fresnelIntensity,
      fresnelIdle: persistent.fresnelIdle,
      activeTileColor: persistent.activeTileColor,
      activeTileColorAmount: persistent.activeTileColorAmount,
      innerRefract: persistent.innerRefract,
      innerRefractEnabled: persistent.innerRefractEnabled,
      overlayZ: persistent.overlayZ,
      lineStartZ: persistent.lineStartZ,
      labelSize: persistent.labelSize,
      lineAlpha: persistent.lineAlpha,
      reveal: persistent.lineReveal,
      interfaceZLift: persistent.interfaceZLift,
      interface: {
        alpha: persistent.interfaceAlpha,
        density: persistent.interfaceDensity,
        quadScale: persistent.interfaceQuadScale,
        ringSpeed: persistent.ringSpeed,
        ringAlpha: persistent.ringAlpha,
        bracketAlpha: persistent.bracketAlpha,
        idleBracket: persistent.idleBracket,
        crossAlpha: persistent.crossAlpha,
        plusAlpha: persistent.plusAlpha,
        color: persistent.interfaceColor,
        whooshInterval: persistent.whooshInterval,
        whooshSpeed: persistent.whooshSpeed,
        whooshWidth: persistent.whooshWidth,
        whooshSmooth: persistent.whooshSmooth,
        whooshAlpha: persistent.whooshAlpha,
        whooshFlicker: persistent.whooshFlicker,
        whooshFlickerSpeed: persistent.whooshFlickerSpeed,
      },
      color: 0xffffff,
      opacity: 1,
      renderer: this.renderer,
      position: new THREE.Vector3(
        persistent.gridX,
        persistent.gridY,
        persistent.gridZ,
      ),
    });

    this.grid.onProjectHover = (project) => this._onProjectHover(project);

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
      uIsIntro: uniform(persistent.screenIntro),
      uIntroHovered: uniform(persistent.screenIntroHover),
      uHoverTransition: uniform(0.0),
      uGlowSpeed: uniform(persistent.screenGlowSpeed),
      uGlowIntensity: uniform(persistent.screenGlowIntensity),
      uVideoBrightness: uniform(persistent.screenVideoBrightness),
      uVideoAspect: uniform(16 / 9),
      uScreenAspect: uniform(2.0),
      uScreenOpacity: uniform(1.0),
    };
    this._screenInset = persistent.screenInset;

    // Project video: frames are decoded on the main thread and streamed in
    // as ImageBitmaps (video elements can't play inside the worker).
    // Stable texture node so the shader survives texture swaps.
    const fallback = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    fallback.needsUpdate = true;
    this._videoFallbackTexture = fallback;
    this._videoTexture = null;
    this._videoTextureNode = textureNode(fallback);

    // Hover state driving the glow→video transition and UI fade
    this._hover = { active: false, progress: 0, bases: null };
    this._hoverDisplacement = persistent.screenHoverDisplacement;
    this._hoverInDuration = persistent.screenHoverIn;
    this._hoverOutDuration = persistent.screenHoverOut;

    // Project mode: hover stays pinned and tiles scale out center-first
    this._projectMode = false;
    this._tilesOut = { progress: 0, target: 0 };
    this._tilesOutDuration = persistent.tilesOutDuration;

    // About mode: same tiles-out, but the screen fades away instead of
    // pinning the hero video
    this._aboutMode = false;

    // Store geometry and material for shader swapping
    this._screenGeometry = geometry;
    this._screenMaterial = material;
    this._currentShaderName = shaderName;
    this._transitionName = persistent.screenTransition;

    // Apply initial shader
    this._applyScreenShader(shaderName);

    this.screenPlane = new THREE.Mesh(geometry, material);
    this.screenPlane.position.z = persistent.screenZ;
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

    const shader = shaderFactory(this._screenUniforms);
    this._screenMaterial.colorNode = this._composeScreenNode(shader);
    this._screenMaterial.needsUpdate = true;
    this._currentShaderName = shaderName;
    return true;
  }

  /**
   * Wrap an idle screen shader with the shader→video transition, driven by
   * uHoverTransition (0 = idle shader, 1 = project video). The transition
   * itself is swappable via the "screenTransition" param (see
   * screenTransitions.js, gl-transitions style contract). The video is
   * sampled with cover-fit UVs so it fills the screen without stretching.
   */
  _composeScreenNode(shader) {
    const u = this._screenUniforms;
    const videoNode = this._videoTextureNode;

    const getFromColor = (uvNode) => vec4(shader.sample(uvNode));

    // Cover-fit: crop whichever axis of the video overflows the screen
    const getToColor = (uvNode) => {
      const B = u.uScreenAspect;
      const C = u.uVideoAspect;
      const scaleUV = B.greaterThan(C).select(
        vec2(1.0, C.div(B)),
        vec2(B.div(C), 1.0),
      );
      const videoUV = uvNode.sub(0.5).mul(scaleUV).add(0.5);
      return vec4(
        videoNode.sample(videoUV).rgb.mul(u.uVideoBrightness),
        float(1.0),
      );
    };

    const transitionFactory =
      SCREEN_TRANSITIONS[this._transitionName] ??
      SCREEN_TRANSITIONS["noise-wipe"];
    const transitioned = transitionFactory({
      getFromColor,
      getToColor,
      progress: u.uHoverTransition,
      ratio: u.uScreenAspect,
    });

    // uScreenOpacity fades the whole screen out (about page); the post
    // composite respects the screen target's alpha
    return transitioned.mul(vec4(1.0, 1.0, 1.0, u.uScreenOpacity));
  }

  /**
   * Switch the shader→video transition at runtime
   * @param {string} transitionName - Name of transition ('strip-datamosh', 'noise-wipe')
   * @returns {boolean} - True if switch was successful
   */
  setScreenTransition(transitionName) {
    if (!SCREEN_TRANSITIONS[transitionName]) {
      console.warn(
        `Screen transition "${transitionName}" not found. Available: ${getAvailableTransitions().join(
          ", ",
        )}`,
      );
      return false;
    }
    this._transitionName = transitionName;
    if (this._screenMaterial) {
      this._applyScreenShader(this._currentShaderName);
    }
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
   * Project of the tile currently under the pointer (null when none)
   */
  get hoveredProject() {
    return this.grid?._hoveredProject ?? null;
  }

  /**
   * Enter project mode: pin the glow→video transition (the screen becomes
   * the project's hero video), scale the tiles out from the center, and
   * stop pointer tracking. `immediate` skips the animations (deep link).
   * @param {{ slug: string, name: string, video?: string }} project
   */
  enterProject(project, { immediate = false } = {}) {
    if (this._projectMode || !project) return;
    this._projectMode = true;

    const hover = this._hover;
    if (!hover.bases) {
      hover.bases = {
        displacement: this.grid.tileUniforms.displacement.value,
        interfaceAlpha: this.grid.interfaceUniforms.alpha.value,
        lineAlpha: this.grid.projectsOverlay?.lineUniforms.alpha.value ?? 1,
        labelOpacity: this.grid.projectsOverlay?.batch?.opacity ?? 1,
      };
    }
    hover.active = true;

    this._tilesOut.target = 1;
    if (immediate) {
      hover.progress = 1;
      this._tilesOut.progress = 1;
      this.grid.setHideProgress(1);
    }

    this.grid.setInteractive(false);

    dispatcher.trigger(
      { name: "projectVideoRequest" },
      { url: project.video ? resolvePublicPath(project.video) : null },
    );
  }

  /**
   * Leave project mode: tiles scale back in, the video wipes back to the
   * idle screen shader, pointer tracking resumes.
   */
  exitProject() {
    if (!this._projectMode) return;
    this._projectMode = false;
    this._hover.active = false;
    this._tilesOut.target = 0;
    this.grid.setInteractive(true);

    dispatcher.trigger({ name: "projectVideoRequest" }, { url: null });
  }

  /**
   * Enter about mode: tiles scale out exactly like project mode, but the
   * screen plane fades to nothing instead of showing a video.
   * `immediate` skips the animations (deep link).
   */
  enterAbout({ immediate = false } = {}) {
    if (this._aboutMode) return;
    this._aboutMode = true;

    // Cancel any in-flight hover so the glow→video transition winds down
    this._hover.active = false;

    this._tilesOut.target = 1;
    if (immediate) {
      this._tilesOut.progress = 1;
      this.grid.setHideProgress(1);
      this._screenUniforms.uScreenOpacity.value = 0;
    }

    this.grid.setInteractive(false);

    dispatcher.trigger({ name: "projectVideoRequest" }, { url: null });
  }

  /**
   * Leave about mode: tiles scale back in, the screen fades back to the
   * idle shader, pointer tracking resumes.
   */
  exitAbout() {
    if (!this._aboutMode) return;
    this._aboutMode = false;
    this._tilesOut.target = 0;
    this.grid.setInteractive(true);
  }

  /**
   * Hovered project changed (from Grid pointer tracking). Ask the main
   * thread to play/stop the project's video and start the hover transition.
   * @param {{ name: string, video?: string }|null} project
   */
  _onProjectHover(project) {
    // Project mode pins the video and screen transition; ignore pointer
    if (this._projectMode) return;

    const hover = this._hover;
    hover.active = Boolean(project?.video);

    // Capture UI/displacement baselines when leaving the fully-idle state so
    // debug-GUI tweaks made while idle are respected
    if (hover.active && hover.progress === 0) {
      hover.bases = {
        displacement: this.grid.tileUniforms.displacement.value,
        interfaceAlpha: this.grid.interfaceUniforms.alpha.value,
        lineAlpha: this.grid.projectsOverlay?.lineUniforms.alpha.value ?? 1,
        labelOpacity: this.grid.projectsOverlay?.batch?.opacity ?? 1,
      };
    }

    dispatcher.trigger(
      { name: "projectVideoRequest" },
      { url: project?.video ? resolvePublicPath(project.video) : null },
    );
  }

  /**
   * A decoded video frame arrived from the main thread.
   * @param {{ bitmap: ImageBitmap, width: number, height: number }} data
   */
  setProjectVideoFrame(data) {
    const bitmap = data?.bitmap;
    if (!bitmap) return;

    if (!this._videoTexture) {
      const tex = new THREE.Texture(bitmap);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      this._videoTexture = tex;
      this._videoTextureNode.value = tex;
    } else {
      const prev = this._videoTexture.image;
      this._videoTexture.image = bitmap;
      this._videoTexture.needsUpdate = true;
      prev?.close?.();
    }

    this._screenUniforms.uVideoAspect.value =
      (data.width || bitmap.width) / (data.height || bitmap.height);
  }

  /**
   * Advance the hover transition: screen glow→video, interface + labels +
   * callout lines fade out, tile displacement eases to its hover target.
   * Frame-rate independent; different in/out durations like the old
   * portfolio (1.3s in / 0.8s out).
   * @param {number} delta - Seconds
   */
  _updateHover(delta) {
    const hover = this._hover;
    if (!hover.bases) return;

    const target = hover.active || this._projectMode ? 1 : 0;
    if (hover.progress === target && target === 0) {
      hover.bases = null;
      return;
    }
    if (hover.progress !== target) {
      const duration = hover.active
        ? this._hoverInDuration
        : this._hoverOutDuration;
      const step = (delta || 1 / 60) / Math.max(duration, 1e-3);
      hover.progress = Math.min(
        1,
        Math.max(0, hover.progress + (hover.active ? step : -step)),
      );
    }

    const p = hover.progress;
    // Cubic in-out
    const eased =
      p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

    this._screenUniforms.uHoverTransition.value = eased;

    const { bases } = hover;
    const fade = 1 - eased;
    this.grid.tileUniforms.displacement.value =
      bases.displacement + (this._hoverDisplacement - bases.displacement) * eased;
    this.grid.interfaceUniforms.alpha.value = bases.interfaceAlpha * fade;

    const overlay = this.grid.projectsOverlay;
    if (overlay) {
      overlay.lineUniforms.alpha.value = bases.lineAlpha * fade;
      if (overlay.batch) overlay.batch.opacity = bases.labelOpacity * fade;
    }

    // Fully idle again: restore exact baselines and stop driving the values
    if (!hover.active && hover.progress === 0) {
      this.grid.tileUniforms.displacement.value = bases.displacement;
      this.grid.interfaceUniforms.alpha.value = bases.interfaceAlpha;
      if (overlay) {
        overlay.lineUniforms.alpha.value = bases.lineAlpha;
        if (overlay.batch) overlay.batch.opacity = bases.labelOpacity;
      }
      hover.bases = null;
    }
  }

  /**
   * Fit the screen plane inside the grid footprint. The screen must stay
   * smaller than the tiles so it never peeks out around the edges (old wall
   * screen was ~80–90% of the wall). Perspective-correct so the inset holds
   * even though the plane sits behind the grid.
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} padding - Visual size relative to the grid (< 1)
   */
  _fitScreenToGrid(camera, padding = this._screenInset) {
    if (!this.screenPlane || !this.grid) return;

    const dims = this.grid.getDimensions();
    if (!(dims.width > 0) || !(dims.height > 0)) return;

    this._screenUniforms.uScreenAspect.value = dims.width / dims.height;

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

    this._updateHover(delta);
    this._updateTilesOut(delta);
    this._updateScreenFade(delta);
  }

  /**
   * Fade the screen plane in/out for about mode, paced like the tiles.
   * @param {number} delta - Seconds
   */
  _updateScreenFade(delta) {
    const u = this._screenUniforms.uScreenOpacity;
    const target = this._aboutMode ? 0 : 1;
    if (u.value === target) return;

    const step = (delta || 1 / 60) / Math.max(this._tilesOutDuration, 1e-3);
    u.value =
      target === 0
        ? Math.max(0, u.value - step)
        : Math.min(1, u.value + step);
  }

  /**
   * Advance the project-mode tiles scale-out (eased CPU-side; the
   * center-outward stagger happens in the compute shader).
   * @param {number} delta - Seconds
   */
  _updateTilesOut(delta) {
    const t = this._tilesOut;
    if (t.progress === t.target) return;

    const step =
      (delta || 1 / 60) / Math.max(this._tilesOutDuration, 1e-3);
    t.progress = Math.min(
      1,
      Math.max(0, t.progress + (t.target === 1 ? step : -step)),
    );

    const p = t.progress;
    const eased =
      p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    this.grid.setHideProgress(eased);
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

    // Sync the area-light quad to the freshly fitted plane
    this.screenLight.updateFromMesh(this.screenPlane);

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

    // Point the light at the recreated screen texture
    this.screenLight.setTexture(this.screenTexture);

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

  attachDebug(gui) {
    if (!gui) return;
    const folder = getDebugFolder(gui, "PersistentScene");
    if (folder._debugBound) return;
    folder._debugBound = true;

    const layoutKeys = new Set([
      "cols",
      "rows",
      "tileSize",
      "gap",
      "cornerRadius",
      "depth",
    ]);

    bindParamGroup(
      gui,
      params.PersistentScene,
      (key) => {
        if (key === "gridX")
          return { object: this.grid.position, property: "x" };
        if (key === "gridY")
          return { object: this.grid.position, property: "y" };
        if (key === "gridZ")
          return { object: this.grid.position, property: "z" };

        if (layoutKeys.has(key)) {
          return {
            object: this.grid.config,
            property: key,
            onChange: () => this.grid.rebuildLayout(),
          };
        }

        if (key === "mouseSize") {
          return {
            object: this.grid.config,
            property: "mouseSize",
            onChange: (v) => {
              if (!this.grid.compute) return;
              this.grid.compute.uniforms.mouseRadius.value =
                v * this.grid.getDimensions().height;
            },
          };
        }

        const computeU = this.grid.compute?.uniforms;
        if (computeU?.[key]) return { uniform: computeU[key] };

        if (key === "displacement")
          return { uniform: this.grid.tileUniforms.displacement };
        if (key === "refractStrength")
          return { uniform: this.grid.tileUniforms.refractStrength };
        if (key === "fresnelIntensity")
          return { uniform: this.grid.tileUniforms.fresnelIntensity };
        if (key === "fresnelIdle")
          return { uniform: this.grid.tileUniforms.fresnelIdle };
        if (key === "activeTileColor")
          return { uniform: this.grid.tileUniforms.activeTileColor };
        if (key === "activeTileColorAmount")
          return { uniform: this.grid.tileUniforms.activeTileColorAmount };
        if (key === "innerRefractEnabled") {
          return {
            object: this.grid.config,
            property: "innerRefractEnabled",
            onChange: () => this.grid.rebuildMaterial(),
          };
        }
        if (key === "innerRefract")
          return { uniform: this.grid.tileUniforms.innerRefract };
        if (key === "chromaticAberration") {
          return {
            object: this.grid.config,
            property: "chromaticAberration",
            onChange: (v) => {
              if (this.grid.material)
                this.grid.material.chromaticAberration = v;
            },
          };
        }

        const ifaceMap = {
          interfaceAlpha: "alpha",
          interfaceDensity: "density",
          interfaceQuadScale: "quadScale",
          ringSpeed: "ringSpeed",
          ringAlpha: "ringAlpha",
          bracketAlpha: "bracketAlpha",
          idleBracket: "idleBracket",
          crossAlpha: "crossAlpha",
          plusAlpha: "plusAlpha",
          interfaceColor: "color",
          whooshInterval: "whooshInterval",
          whooshSpeed: "whooshSpeed",
          whooshWidth: "whooshWidth",
          whooshSmooth: "whooshSmooth",
          whooshAlpha: "whooshAlpha",
          whooshFlicker: "whooshFlicker",
          whooshFlickerSpeed: "whooshFlickerSpeed",
        };
        if (ifaceMap[key] && this.grid.interfaceUniforms[ifaceMap[key]]) {
          return { uniform: this.grid.interfaceUniforms[ifaceMap[key]] };
        }

        if (key === "interfaceZLift") {
          return {
            object: this.grid.config,
            property: "interfaceZLift",
            onChange: () => this.grid._syncFaceZ(),
          };
        }

        if (key === "overlayZ") {
          return {
            object: this.grid.overlayOptions,
            property: "overlayZ",
            onChange: (v) =>
              this.grid.projectsOverlay?.applyParams({ overlayZ: v }),
          };
        }
        if (key === "lineStartZ") {
          return {
            object: this.grid.config,
            property: "lineStartZ",
            onChange: () => this.grid._syncFaceZ(),
          };
        }
        if (key === "labelSize") {
          return {
            object: this.grid.overlayOptions,
            property: "labelSize",
            onChange: (v) =>
              this.grid.projectsOverlay?.applyParams({ labelSize: v }),
          };
        }
        if (key === "lineAlpha")
          return { uniform: this.grid.projectsOverlay?.lineUniforms.alpha };
        if (key === "lineReveal")
          return { uniform: this.grid.projectsOverlay?.lineUniforms.reveal };

        if (key === "screenShader") {
          return {
            object: this,
            property: "_currentShaderName",
            onChange: (v) => this.setScreenShader(v),
          };
        }
        if (key === "screenTransition") {
          return {
            object: this,
            property: "_transitionName",
            onChange: (v) => this.setScreenTransition(v),
          };
        }
        if (key === "screenInset")
          return { object: this, property: "_screenInset" };
        if (key === "screenZ")
          return { object: this.screenPlane.position, property: "z" };
        if (key === "screenIntro")
          return { uniform: this._screenUniforms.uIsIntro };
        if (key === "screenIntroHover")
          return { uniform: this._screenUniforms.uIntroHovered };
        if (key === "screenGlowSpeed")
          return { uniform: this._screenUniforms.uGlowSpeed };
        if (key === "screenGlowIntensity")
          return { uniform: this._screenUniforms.uGlowIntensity };
        if (key === "screenVideoBrightness")
          return { uniform: this._screenUniforms.uVideoBrightness };
        if (key === "screenHoverDisplacement")
          return { object: this, property: "_hoverDisplacement" };
        if (key === "screenHoverIn")
          return { object: this, property: "_hoverInDuration" };
        if (key === "screenHoverOut")
          return { object: this, property: "_hoverOutDuration" };
        if (key === "tilesOutDuration")
          return { object: this, property: "_tilesOutDuration" };
        if (key === "tilesOutSpread")
          return { uniform: this.grid.compute?.uniforms.hideSpread };

        if (key === "screenLightIntensity")
          return { uniform: this.screenLight.intensity };
        if (key === "screenLightBlur")
          return { uniform: this.screenLight.blur };
        if (key === "screenLightColor")
          return { uniform: this.screenLight.color };

        return null;
      },
      "PersistentScene",
    );
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

    if (this._videoTexture) {
      this._videoTexture.image?.close?.();
      this._videoTexture.dispose();
      this._videoTexture = null;
    }
    this._videoFallbackTexture?.dispose();
  }
}
