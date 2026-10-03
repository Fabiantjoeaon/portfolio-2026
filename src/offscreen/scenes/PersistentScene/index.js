import { getFlag } from "@/offscreen/lib/query";
import { timingEase } from "@/offscreen/lib/customEases";
import { timings } from "@/shared/timings";
import { mobileSettings } from "@/shared/mobileSettings";
import * as THREE from "three/webgpu";
import { NodeMaterial, HalfFloatType } from "three/webgpu";
import {
  uniform,
  vec2,
  vec3,
  vec4,
  float,
  min,
  mix, Fn, If,
  texture as textureNode,
} from "three/tsl";
import dispatcher from "@/shared/dispatcher";
import { createRenderTarget } from "../../utils/renderTarget.js";
import { ScreenLight } from "../../lighting/screenLight/ScreenLight.js";
import { ScreenShafts } from "../../lighting/screenLight/ScreenShafts.js";
import { Grid } from "./Grid/index.js";
import { SCREEN_SHADERS, getAvailableShaders } from "./screenShaders.js";
import {
  SCREEN_TRANSITIONS,
  createStripDatamoshGlitchTransition,
  getAvailableTransitions,
} from "./screenTransitions.js";
import {
  bindParamGroup,
  bindDebugParams,
  getDebugFolder,
} from "@/offscreen/debug/bindDebugParams";
import { params, paramValues } from "@/offscreen/params";
import { PROJECTS, mediaSrc } from "@/shared/projects";
import { resolvePublicPath } from "../../utils/publicPath.js";
import { projectLayout } from '@/shared/projectLayout';
import ProjectGallery, { videoUrl } from './ProjectGallery';
import VideoChannel, { writeVideoFrame } from './VideoChannel';
import { gradeVideo } from './gradeVideo';

const persistent = paramValues(params.PersistentScene);
const _clearColor = new THREE.Color();
const _identityQuaternion = new THREE.Quaternion();
const _screenCorner = new THREE.Vector3();
// Eased tile exit at which the last tiles read as gone; the linear tail of a
// long ease-out is invisible and must not hold the screen back.
const TILES_CLEAR = 0.98;
const HOVER_PREPARE_DELAY_MS = 250;

/**
 * Manages objects that persist across all scenes.
 * These objects are drawn over the composited scene to the canvas.
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
  constructor(renderer, width, height, devicePixelRatio = 1, visibleHeight = height) {
    this.renderer = renderer;
    this._devicePixelRatio = devicePixelRatio;
    this._viewportWidth = width;
    this._viewportHeight = height;
    this._visibleHeight = visibleHeight;
    const galleryVisuals = paramValues(params.PersistentScene.Gallery);
    const touch = getFlag('touchExperience');
    this.gallerySettings = new Proxy(galleryVisuals, {
      get: (target, key) => {
        if (touch && (key === 'galleryBars' || key === 'galleryStagger')) return mobileSettings[key];
        return key in timings.gallery ? timings.gallery[key] : target[key];
      },
      set: (target, key, value) => {
        if (key in timings.gallery) timings.gallery[key] = value;
        else target[key] = value;
        return true;
      },
    });

    // Main scene for foreground elements (grid tiles)
    this.scene = new THREE.Scene();

    // Separate scene for screen/background plane (rendered first, sampled by tiles)
    this.screenScene = new THREE.Scene();

    this.testObject = null;
    this.grid = null;
    this.screenPlane = null;

    // Create screen render target
    this._createScreenTarget(width, height, devicePixelRatio);

    // Light emission lives in the screen's own UV space, independent of the
    // viewing camera. The compositing target can be empty when looking away.
    this.screenLightTarget = createRenderTarget(256, 128, {
      type: HalfFloatType, depthBuffer: false, samples: 0,
    });
    this._emitterScene = new THREE.Scene();
    this._emitterCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2);
    this._emitterCamera.position.z = 1;

    // Textured LTC area light driven by the screen plane; scenes opt in via
    // screenLight.applyTo(material, ...)
    this.screenLight = new ScreenLight({
      lightTexture: this.screenLightTarget.texture,
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
    this._emitterQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._emitterMaterial);
    this._emitterScene.add(this._emitterQuad);

    // Initialize grid (in main scene)
    this._setupGrid();

    this.shafts = new ScreenShafts({
      renderer,
      screenLight: this.screenLight,
      grid: this.grid,
      settings: persistent,
    });
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
      ...paramValues(params.PersistentScene.Project),
      hideSpread: timings.tiles.stagger,
      pushStrength: persistent.pushStrength,
      pushZ: persistent.pushZ,
      hoverLift: persistent.hoverLift,
      rotationStrength: persistent.rotationStrength,
      mouseSize: persistent.mouseSize,
      mouseSnapRange: persistent.mouseSnapRange,
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
      enhancedGlassEnabled: persistent.enhancedGlassEnabled,
      glassIOR: persistent.glassIOR,
      glassRoughness: persistent.glassRoughness,
      glassDistance: persistent.glassDistance,
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
      uVideoSaturation: uniform(persistent.screenVideoSaturation),
      uVideoLift: uniform(persistent.screenVideoLift),
      uVideoMaxBrightness: uniform(persistent.screenVideoMaxBrightness),
      uVideoDisplaySaturation: uniform(persistent.screenVideoDisplaySaturation),
      uVideoDisplayGain: uniform(persistent.screenVideoDisplayGain),
      uVideoGrade: uniform(1),
      uVideoAspect: uniform(16 / 9),
      uScreenAspect: uniform(2.0),
      uScreenOpacity: uniform(1.0),
      uScreenExit: uniform(0),
      uScreenEnter: uniform(1),
    };
    this._videoGrade = {
      brightness: this._screenUniforms.uVideoBrightness,
      saturation: this._screenUniforms.uVideoSaturation,
      lift: this._screenUniforms.uVideoLift,
      maxBrightness: this._screenUniforms.uVideoMaxBrightness,
      amount: this._screenUniforms.uVideoGrade,
    };
    this._screenInset = persistent.screenInset;
    this._screenBaseZ = persistent.screenZ;

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
    this._pendingVideoFrame = null;
    // The outgoing film's last frame, kept on its gallery slide until the stream returns.
    this._heldVideo = { texture: null, url: null, aspect: 1 };
    this._videoTextureNode = textureNode(fallback);
    this._activeVideoUrl = null;
    this._videoFrameUrl = null;
    this._videoWaiters = [];
    this._detailVideos = ['detail0', 'detail1'].map(name => new VideoChannel(name));
    this._stills = new Map();
    this._stillProject = null;
    for (const project of PROJECTS) if (!project.video) this._loadStill(project);

    // Hover state driving the glow→video transition and tile displacement
    this._hover = { active: false, progress: 0, bases: null };
    this._hoverDisplacement = persistent.screenHoverDisplacement;

    // Overlay hide (labels scramble + line reveal + interface fade). Shared
    // by video hover, project page, and about page.
    this._overlayOut = { progress: 0, target: 0, bases: null, introIn: false };

    // Project mode: hover stays pinned and tiles scale out center-first
    this._projectMode = false;
    this._tilesOut = { progress: 0, target: 0 };
    this.pageTiming = timings.pages;
    this._pageElapsed = 0;
    this._projectQuad = 0;
    this._quadPosition = new THREE.Vector3();
    this._quadOffset = new THREE.Vector3();
    this._quadQuaternion = new THREE.Quaternion();
    // Room screen pose in camera space, normalized by its distance. Followed
    // live during the entry wipe, then frozen so the camera cut at the wipe's
    // end cannot move a screen that is still in flight.
    this._quadFrom = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector2() };
    this.followRoomScreen = false;

    // About mode: same tiles-out, but the screen fades away instead of
    // pinning the hero video
    this._aboutMode = false;
    this._screenFadeProgress = 1;

    // Store geometry and material for shader swapping
    this._screenGeometry = geometry;
    this._screenMaterial = material;
    // The light emitter renders the ungraded-for-display screen, so display
    // tweaks never change the room lighting.
    this._emitterMaterial = new NodeMaterial();
    this._emitterMaterial.transparent = true;
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
    this._screenMaterial.colorNode = this._composeScreenNode(shader, true);
    this._screenMaterial.needsUpdate = true;
    this._emitterMaterial.colorNode = this._composeScreenNode(shader, false);
    this._emitterMaterial.needsUpdate = true;
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
  _composeScreenNode(shader, display) {
    const u = this._screenUniforms;
    const videoNode = this._videoTextureNode;

    const getFromColor = (uvNode) => vec4(shader.sample(uvNode));

    // CSS background-size: cover; background-position: center
    const getToColor = (uvNode) => {
      const screenAspect = u.uScreenAspect;
      const videoAspect = u.uVideoAspect.max(0.001);
      const ratio = vec2(
        min(screenAspect.div(videoAspect), 1.0),
        min(videoAspect.div(screenAspect), 1.0),
      );
      const covered = uvNode.sub(vec2(0.5)).mul(ratio).add(vec2(0.5));
      const videoUV = vec2(covered.x, float(1).sub(covered.y)).clamp(0, 1);
      const graded = gradeVideo(videoNode.sample(videoUV).rgb, {
        brightness: u.uVideoBrightness,
        saturation: u.uVideoSaturation,
        lift: u.uVideoLift,
        maxBrightness: u.uVideoMaxBrightness,
        amount: u.uVideoGrade,
      });
      if (!display) return vec4(graded, float(1.0));
      const boost = (value) => mix(float(1), value, u.uVideoGrade);
      const luma = vec3(graded.dot(vec3(0.2126, 0.7152, 0.0722)));
      return vec4(mix(luma, graded, boost(u.uVideoDisplaySaturation)).max(0).mul(boost(u.uVideoDisplayGain)), float(1.0));
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
    const glitchOut = createStripDatamoshGlitchTransition({
      getFromColor: (st) => mix(getFromColor(st), getToColor(st), u.uHoverTransition),
      getToColor: () => vec4(0, 0, 0, 0),
      progress: u.uScreenExit,
      ratio: u.uScreenAspect,
    });
    const glitchIn = createStripDatamoshGlitchTransition({
      getFromColor: () => vec4(0, 0, 0, 0),
      getToColor: getFromColor,
      progress: u.uScreenEnter,
      ratio: u.uScreenAspect,
    });
    return Fn(() => {
      const result = vec4(0).toVar();
      If(u.uScreenEnter.lessThan(1), () => { result.assign(glitchIn); })
        .ElseIf(u.uScreenExit.greaterThan(0), () => { result.assign(glitchOut); })
        .Else(() => { result.assign(transitioned); });
      return result.mul(vec4(1, 1, 1, u.uScreenOpacity));
    })();
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
    return this.grid?._projectHover.value ?? null;
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
    this._screenHeldForPage = false;
    this._projectMotionReady = immediate;
    this.gallery?.dispose();
    this.gallery = this._takeGallery(project);
    this.gallery.revealPage(immediate, { center: false });
    this.screenScene.add(this.gallery);
    this.setProjectScroll(0);
    this._tilePreview = null;
    this._pageElapsed = immediate ? Infinity : 0;
    this._projectQuad = immediate ? 1 : 0;

    const hover = this._hover;
    if (!hover.bases) {
      hover.bases = {
        displacement: this.grid.tileUniforms.displacement.value,
      };
    }
    hover.active = true;
    this._pinOverlayOut({ immediate });

    this._tilesOut.target = 1;
    if (immediate) {
      hover.progress = 1;
      this._tilesOut.progress = 1;
      this.grid.setHideProgress(1);
      this._setScreenIntensity(0);
    }

    this.grid.setInteractive(false);

    this._requestScreenMedia(project);
  }

  /** Play the project's thumbnail on the screen, or show its first image when it has none. */
  _requestScreenMedia(project) {
    const url = videoUrl(project?.video);
    this._activeVideoUrl = url;
    this._stillProject = url ? null : project;
    dispatcher.trigger({ name: "projectVideoRequest" }, { url });
    if (!url && project) this._loadStill(project).then(still => {
      if (!still || this._stillProject !== project) return;
      this._videoTextureNode.value = still.texture;
      this._videoFrameUrl = still.url;
      this._screenUniforms.uVideoAspect.value = still.aspect;
    });
  }

  _loadStill(project) {
    if (this._stills.has(project.slug)) return this._stills.get(project.slug);
    const image = project.media.find(media => media.type === 'image');
    const still = image ? (async () => {
      const { src, width, height } = mediaSrc(image, getFlag('touchExperience'));
      const url = resolvePublicPath(src);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Screen still: ${response.status}`);
        const texture = new THREE.Texture(await createImageBitmap(await response.blob()));
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        this.renderer.initTexture(texture);
        return { texture, url, aspect: width / height };
      } catch (error) {
        console.warn(error.message);
        return null;
      }
    })() : Promise.resolve(null);
    this._stills.set(project.slug, still);
    return still;
  }

  // Hold the outgoing page pose until both GPU and DOM content are gone.
  prepareHomeReturn() {
    this._homeReturn = { stage: 'content', elapsed: 0 };
    this._screenHeldForPage = true;
    this.grid.setInteractive(false);
  }

  startHomeReturn(immediate = false, timing = timings.homeReturn) {
    this._homeReturn = { stage: 'reveal', elapsed: 0, immediate, timing, tilePhase: timing === timings.startup ? 'startup' : 'return' };
    this.gallery?.dispose();
    this.gallery = null;
    this._projectMode = this._aboutMode = false;
    this.setProjectScroll(0);
    this._hover.active = false;
    this._hover.progress = 0;
    if (this._hover.bases)
      this.grid.tileUniforms.displacement.value = this._hover.bases.displacement;
    this._hover.bases = null;
    this._screenUniforms.uHoverTransition.value = 0;
    // Restore the idle pose while invisible; reveal it in place.
    this._projectQuad = 0;
    this._screenFadeProgress = 1;
    this._screenUniforms.uScreenOpacity.value = 0;
    this._screenUniforms.uScreenExit.value = 0;
    this._screenUniforms.uScreenEnter.value = 0;
    this._setScreenIntensity(0);
    this._activeVideoUrl = null;
    dispatcher.trigger({ name: 'projectVideoRequest' }, { url: null });
  }

  updateHomeReturn(delta, readyAt = 1) {
    const state = this._homeReturn;
    if (state?.stage !== 'reveal') return false;
    return this._stepHomeReturn(state, delta, readyAt);
  }

  _stepHomeReturn(state, delta, readyAt = 1) {
    const t = state.timing;
    state.elapsed += delta || 1 / 60;
    const progress = (delay, duration) => state.immediate ? 1 :
      THREE.MathUtils.clamp((state.elapsed - delay) / Math.max(duration, 1e-3), 0, 1);
    const screen = progress(t.screenDelay, t.screenDuration);
    const tileTiming = timings.tiles;
    const tiles = progress(t.screenDelay + tileTiming[`${state.tilePhase}Delay`], tileTiming[`${state.tilePhase}Duration`]);
    this._screenHeldForPage = screen === 0;
    this._screenUniforms.uScreenEnter.value = timingEase(t.screenEase)(screen);
    this._screenUniforms.uScreenOpacity.value = screen > 0 ? 1 : 0;
    this._emitterQuad.visible = screen > 0;
    this._tilesOut.progress = 1 - tiles;
    const tileEase = tileTiming[`${state.tilePhase}Ease`];
    const tileReveal = timingEase(tileEase)(tiles);
    this.grid.setHideProgress(1 - tileReveal, false);
    this._setScreenIntensity(tileReveal);
    if (tiles > 0 && !state.overlayReleased) {
      state.overlayReleased = true;
      this._releaseOverlayOut();
      if (state.immediate) {
        this._overlayOut.progress = 0;
        this.grid.projectsOverlay?.finishIntro();
      }
    }
    return screen >= readyAt && tiles >= readyAt;
  }

  // Interaction returns before the reveal ends; the rest plays out as a tail
  // until a page or tile takes the grid over.
  finishHomeReturn() {
    const state = this._homeReturn;
    this._homeReturn = null;
    this._tilesOut.progress = this._tilesOut.target = 0;
    this._screenHeldForPage = false;
    this.grid.setInteractive(true);
    if (state?.stage === 'reveal' && !state.immediate) this._homeReturnTail = state;
    else this._endHomeReturnTail();
  }

  _updateHomeReturnTail(delta) {
    const state = this._homeReturnTail;
    if (!state) return;
    if (this._tilesOut.target !== 0 || this._projectMode || this._aboutMode) {
      this._tilesOut.progress = this.grid.hideUniforms.hideProgress.value;
      this._homeReturnTail = null;
      return;
    }
    if (this._stepHomeReturn(state, delta)) this._endHomeReturnTail();
  }

  _endHomeReturnTail() {
    this._homeReturnTail = null;
    this._screenUniforms.uScreenEnter.value = 1;
    this._setScreenIntensity(1);
  }

  /**
   * Enter about mode: tiles scale out exactly like project mode, but the
   * screen plane fades to nothing instead of showing a video.
   * `immediate` skips the animations (deep link).
   */
  enterAbout({ immediate = false } = {}) {
    if (this._aboutMode) return;
    this._aboutMode = true;
    this._tilePreview = null;
    this._pageElapsed = immediate ? Infinity : 0;

    // Cancel any in-flight video hover; overlay still animates out
    this._hover.active = false;
    this._pinOverlayOut({ immediate });

    this._tilesOut.target = 1;
    if (immediate) {
      this._tilesOut.progress = 1;
      this.grid.setHideProgress(1);
      this._setScreenIntensity(0);
      this._screenFadeProgress = 0;
      this._screenUniforms.uScreenOpacity.value = 0;
      this._screenUniforms.uScreenExit.value = 1;
      this.screenPlane.visible = false;
    }

    this.grid.setInteractive(false);

    this._activeVideoUrl = null;
    dispatcher.trigger({ name: "projectVideoRequest" }, { url: null });
  }

  /**
   * Fetch, decode, upload and compile a project's gallery ahead of its page
   * transition, so the transition itself allocates nothing.
   */
  prepareProject(project) {
    if (this._preparedGallery?.project === project) return this._preparedGallery.warm;
    this._preparedGallery?.dispose();
    const gallery = this._createGallery(project);
    const preload = gallery.urls.find(Boolean);
    if (preload) dispatcher.trigger({ name: "projectVideoPreload" }, { url: preload });
    gallery.warm = gallery.ready.then(() => this._warmGallery(gallery)).catch(error => console.warn(error));
    this._preparedGallery = gallery;
    return gallery.warm;
  }

  _takeGallery(project) {
    const prepared = this._preparedGallery;
    this._preparedGallery = null;
    if (prepared?.project === project) return prepared;
    prepared?.dispose();
    return this._createGallery(project);
  }

  _createGallery(project) {
    return new ProjectGallery(project, this._videoTextureNode, this._detailVideos, this._videoFallbackTexture, this._videoGrade, this.gallerySettings, map => this._uploadGalleryTexture(map));
  }

  /**
   * Upload a decoded image now and drop its CPU copy: a gallery holds up to
   * ~50MB of bitmaps on mobile, which iOS counts against the tab until the
   * page is killed.
   */
  _uploadGalleryTexture(map) {
    const image = map.image;
    this.renderer.initTexture(map);
    map.image = { width: image.width, height: image.height };
    image.close();
  }

  async _warmGallery(gallery) {
    const camera = this._screenCamera;
    if (gallery.disposed || !camera) return;
    gallery.createStills();
    gallery.updateSlots(0);
    const meshes = gallery.stills.map(still => still.mesh);
    gallery.visible = true;
    for (const mesh of meshes) mesh.visible = true;
    const target = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.screenTarget);
    const compiling = this.renderer.compileAsync(gallery, camera, this.screenScene);
    this.renderer.setRenderTarget(target);
    gallery.visible = false;
    for (const mesh of meshes) mesh.visible = false;
    await compiling;
  }

  /** Start a project's reel and resolve once its first frame is on the GPU side. */
  prepareProjectVideo(project, timeout = 2500) {
    const url = videoUrl(project?.video);
    if (!url || this._videoFrameUrl === url) return Promise.resolve();
    if (this._activeVideoUrl !== url) {
      this._activeVideoUrl = url;
      dispatcher.trigger({ name: "projectVideoRequest" }, { url });
    }
    return new Promise(resolve => {
      const timer = setTimeout(resolve, timeout);
      this._videoWaiters.push({ url, resolve: () => { clearTimeout(timer); resolve(); } });
    });
  }

  /** Keep the grid hidden and the screen in page space during pinned routes. */
  async changePinnedContent(project, { immediate = false } = {}) {
    const incoming = project ? this._takeGallery(project) : null;
    this._screenHeldForPage = true;
    await Promise.all([incoming?.ready, this.gallery?.hidePage(immediate)]);
    this.gallery?.dispose();
    this.gallery = incoming;
    this._projectMode = Boolean(project);
    this._aboutMode = !project;
    this._projectMotionReady = true;
    this._projectQuad = 1;
    this.setProjectScroll(0);
    this._pageElapsed = Infinity;
    this._hover.active = Boolean(project);
    this._tilesOut.progress = this._tilesOut.target = 1;
    this.grid.setHideProgress(1);
    this._setScreenIntensity(0);
    this.grid.setInteractive(false);
    this._pinOverlayOut({ immediate: true });
    this._screenFadeProgress = project ? 1 : 0;
    this._screenUniforms.uScreenOpacity.value = this._screenFadeProgress;
    this._screenUniforms.uScreenExit.value = 1 - this._screenFadeProgress;
    const url = videoUrl(project?.video);
    if (!url || url !== this._videoFrameUrl) {
      this._videoTextureNode.value = this._videoFallbackTexture;
      this._videoFrameUrl = null;
    }
    this._heldVideo.url = null;
    this._requestScreenMedia(project);
    if (incoming) {
      incoming.revealPage(immediate);
      this.screenScene.add(incoming);
    }
  }

  /**
   * Hovered project changed (from Grid pointer tracking). Ask the main
   * thread to play/stop the project's video and start the hover transition.
   * @param {{ name: string, video?: string }|null} project
   */
  _onProjectHover(project) {
    // Sent before the page guard so the touch label clears when a page opens.
    if (this.grid.touch) dispatcher.trigger({ name: 'touchProject' }, {
      project: project ? { slug: project.slug, name: project.name } : null,
    });
    // Project mode pins the video and screen transition; ignore pointer
    if (this._projectMode || this._aboutMode) return;

    const hover = this._hover;
    hover.active = Boolean(project);

    // Capture UI/displacement baselines when leaving the fully-idle state so
    // debug-GUI tweaks made while idle are respected
    if (hover.active && hover.progress === 0) {
      hover.bases = {
        displacement: this.grid.tileUniforms.displacement.value,
      };
    }

    this._requestScreenMedia(project);
    // Dragging across the grid would otherwise load and drop a full gallery per tile.
    clearTimeout(this._hoverPrepareTimer);
    if (project) this._hoverPrepareTimer = setTimeout(() => {
      if (this.hoveredProject === project && !this._projectMode && !this._aboutMode) this.prepareProject(project);
    }, HOVER_PREPARE_DELAY_MS);
  }

  /**
   * The screen stream follows the active gallery slide: its film, or nothing
   * on an image. The thumbnail hands over to its film at the same time.
   */
  _syncGalleryVideo() {
    const gallery = this.gallery;
    if (!gallery?.visible || gallery.departing || !this._projectMode) return;
    const url = gallery.screenUrl;
    if (url === this._activeVideoUrl) return;
    const sync = gallery.activeMedia?.thumbSource && this._activeVideoUrl === gallery.thumbUrl;
    const resume = url !== null && url === this._heldVideo.url;
    this._activeVideoUrl = url;
    dispatcher.trigger({ name: 'projectVideoRequest' }, { channel: 'screen', url, sync, resume });
  }

  // The canvas is translated to this exact scroll on the main thread, so it
  // must be rendered as-is (no extrapolation) to stay locked to the DOM.
  setProjectScroll(scroll) {
    this._projectScroll = scroll;
  }

  /**
   * A decoded video frame arrived from the main thread.
   * @param {{ frame?: VideoFrame, bitmap?: ImageBitmap, width: number, height: number, url?: string }} data
   */
  setProjectVideoFrame(data) {
    const image = data?.frame ?? data?.bitmap;
    if (!image) return;
    const detail = data.channel && data.channel !== 'screen'
      ? this._detailVideos.find(channel => channel.name === data.channel) : null;
    if (detail) return detail.setFrame(data);
    if (data.url != null && data.url !== this._activeVideoUrl) {
      image.close?.();
      return;
    }
    // Applied at the start of update() so the gallery never samples a frame
    // from a different film than the one it marked live.
    this._pendingVideoFrame?.image.close?.();
    this._pendingVideoFrame = { image, isFrame: Boolean(data.frame), width: data.width || 1, height: data.height || 1, url: data.url ?? this._activeVideoUrl };
  }

  _commitVideoFrame() {
    const pending = this._pendingVideoFrame;
    if (!pending) return;
    this._pendingVideoFrame = null;
    const { image, isFrame, width, height, url } = pending;
    if (url !== this._activeVideoUrl) {
      image.close?.();
      return;
    }
    const held = this._heldVideo;
    if (this._videoFrameUrl && url !== this._videoFrameUrl && this._videoTextureNode.value === this._videoTexture) {
      [this._videoTexture, held.texture] = [held.texture, this._videoTexture];
      held.url = this._videoFrameUrl;
      held.aspect = this._screenUniforms.uVideoAspect.value;
    }
    this._videoTexture = writeVideoFrame(this._videoTexture, image, isFrame, width, height);
    this._videoTextureNode.value = this._videoTexture;
    this._videoFrameUrl = url;
    if (this._videoWaiters.length) {
      this._videoWaiters = this._videoWaiters.filter(waiter => waiter.url !== this._videoFrameUrl || waiter.resolve());
    }

    this._screenUniforms.uVideoAspect.value = width / height;
  }

  /**
   * Advance the glow→video wipe and tile displacement. Overlay hide lives
   * on `_updateOverlayOut` so about/project can share it without a video.
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
      const goingIn = target === 1;
      const duration = goingIn
        ? timings.hover.inDuration
        : timings.hover.outDuration;
      const step = (delta || 1 / 60) / Math.max(duration, 1e-3);
      hover.progress = Math.min(
        1,
        Math.max(0, hover.progress + (goingIn ? step : -step)),
      );
    }

    const p = hover.progress;
    const eased =
      timingEase(timings.hover.ease)(p);

    this._screenUniforms.uHoverTransition.value = eased;

    const { bases } = hover;
    this.grid.tileUniforms.displacement.value =
      bases.displacement + (this._hoverDisplacement - bases.displacement) * eased;

    if (target === 0 && hover.progress === 0) {
      this.grid.tileUniforms.displacement.value = bases.displacement;
      hover.bases = null;
    }
  }

  _captureOverlayBases() {
    if (this._overlayOut.bases) return;
    this._overlayOut.bases = {
      interfaceAlpha: this.grid.interfaceUniforms.alpha.value,
      lineReveal: this.grid.projectsOverlay?.lineUniforms.reveal.value ?? 1,
      scrambleProgress: this.grid.projectsOverlay?.scramble?.progress.value ?? 1,
    };
  }

  _applyOverlay(eased) {
    const bases = this._overlayOut.bases;
    if (!bases) return;
    const fade = 1 - eased;
    this.grid.interfaceUniforms.alpha.value = bases.interfaceAlpha * fade;
    const overlay = this.grid.projectsOverlay;
    if (!overlay) return;

    // Full hide→show: keep reveal/scramble full and let playIn() stagger
    // via the intro clock. Partial hover just reverses the fade.
    if (this._overlayOut.introIn) {
      overlay.visible = true;
      overlay.lineUniforms.reveal.value = bases.lineReveal;
      if (overlay.scramble) {
        overlay.scramble.progress.value = bases.scrambleProgress;
      }
      return;
    }

    overlay.lineUniforms.reveal.value = bases.lineReveal * fade;
    if (overlay.scramble) overlay.scramble.progress.value = fade;
    overlay.visible = fade > 0;
  }

  _restoreOverlay() {
    const bases = this._overlayOut.bases;
    if (!bases) return;
    this.grid.interfaceUniforms.alpha.value = bases.interfaceAlpha;
    const overlay = this.grid.projectsOverlay;
    if (overlay) {
      overlay.visible = true;
      overlay.lineUniforms.reveal.value = bases.lineReveal;
      if (overlay.scramble) overlay.scramble.progress.value = bases.scrambleProgress;
    }
    this._overlayOut.bases = null;
    this._overlayOut.introIn = false;
  }

  _pinOverlayOut({ immediate = false } = {}) {
    this._captureOverlayBases();
    this._overlayOut.target = 1;
    if (immediate) {
      this._overlayOut.progress = 1;
      this._applyOverlay(1);
    }
  }

  _releaseOverlayOut() {
    if (this._overlayOut.progress === 1) {
      this.grid.projectsOverlay?.playIn();
      this._overlayOut.introIn = true;
    }
    this._overlayOut.target = 0;
  }

  /**
   * Drive label scramble, callout line reveal, and interface fade. Target
   * is 1 (hidden) while a project is hovered or a page is pinned.
   * @param {number} delta - Seconds
   */
  _updateOverlayOut(delta) {
    if (this._homeReturn && !this._homeReturn.overlayReleased) {
      if (this.grid.projectHint) this.grid.projectHint.visible = false;
      return;
    }
    if (this.grid.projectHint) this.grid.projectHint.visible = !this._projectMode && !this._aboutMode;
    const out = this._overlayOut;
    const target =
      this._hover.active || this._projectMode || this._aboutMode ? 1 : 0;

    if (target === 0 && out.target === 1) {
      if (out.progress === 1) {
        this.grid.projectsOverlay?.playIn();
        out.introIn = true;
      }
    } else if (target === 1) {
      this.grid.projectsOverlay?.finishIntro();
      out.introIn = false;
    }
    out.target = target;

    if (out.progress === 0 && target === 0) {
      if (out.bases) this._restoreOverlay();
      return;
    }

    if (target === 1) this._captureOverlayBases();

    if (out.progress !== target) {
      const duration =
        target === 1 ? (this._projectMode || this._aboutMode ? timings.tiles.duration * timings.hover.pageOverlayFactor : timings.hover.inDuration) : timings.hover.outDuration;
      const step = (delta || 1 / 60) / Math.max(duration, 1e-3);
      out.progress = Math.min(
        1,
        Math.max(0, out.progress + (target === 1 ? step : -step)),
      );
    }

    const p = out.progress;
    const eased =
      this._projectMode || this._aboutMode
        ? timingEase(timings.pages.ease)(p)
        : 1 - timingEase(timings.hover.overlayEase)(1 - p);
    this._applyOverlay(eased);

    if (out.progress === 0 && target === 0) this._restoreOverlay();
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

    this.screenPlane.quaternion.identity();
    this.screenPlane.position.z = this._screenBaseZ;
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
    if (camera?.isPerspectiveCamera && this._projectQuad > 0) {
      // Camera-facing quad: centered and aspect-correct at every viewport size.
      // Blended in camera space, so the flight only ever moves on screen.
      camera.updateWorldMatrix(true, false);
      const distance = Math.max(1, camera.position.distanceTo(this.screenPlane.position));
      const from = this._quadFrom;
      if (this.followRoomScreen) {
        from.position.copy(this.screenPlane.position).applyMatrix4(camera.matrixWorldInverse).divideScalar(distance);
        from.quaternion.copy(camera.quaternion).invert().multiply(this.screenPlane.quaternion);
        from.scale.set(this.screenPlane.scale.x / distance, this.screenPlane.scale.y / distance);
      }
      const viewHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
      const layout = projectLayout(this._viewportWidth, this._viewportHeight, getFlag("touchExperience") || this._viewportWidth <= 700, this._visibleHeight);
      const pixelsToWorld = viewHeight / this._viewportHeight;
      const height = layout.mediaHeight * pixelsToWorld;
      // Match the DOM media center. +Y is up, page Y grows downward.
      const verticalOffset = this._viewportHeight / 2 - (layout.top + layout.mediaHeight / 2);
      const progress = timingEase(this._homeReturn ? timings.homeReturn.screenEase : timings.pages.screenEase)(this._projectQuad);
      this._quadPosition.copy(from.position).multiplyScalar(distance)
        .lerp(this._quadOffset.set(0, verticalOffset * pixelsToWorld, -distance), progress);
      this.screenPlane.position.copy(this._quadPosition).applyMatrix4(camera.matrixWorld);
      this._quadQuaternion.slerpQuaternions(from.quaternion, _identityQuaternion, progress);
      this.screenPlane.quaternion.copy(camera.quaternion).multiply(this._quadQuaternion);
      this.screenPlane.scale.x = THREE.MathUtils.lerp(from.scale.x * distance, height * layout.mediaWidth / layout.mediaHeight, progress);
      this.screenPlane.scale.y = THREE.MathUtils.lerp(from.scale.y * distance, height, progress);
      // Scroll is already eased by Lenis. Apply it in screen space after the
      // entrance pose, so the gallery travels exactly with its DOM hit areas.
      const depth = this._quadOffset.copy(this.screenPlane.position).applyMatrix4(camera.matrixWorldInverse).z;
      const scrollScale = -2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / this._viewportHeight;
      this.screenPlane.position.add(this._quadOffset.set(0, (this._projectScroll ?? 0) * scrollScale, 0).applyQuaternion(camera.quaternion));
      this._screenUniforms.uScreenAspect.value = this.screenPlane.scale.x / this.screenPlane.scale.y;
    }
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

  // About fades every persistent element out. Once the animations finish,
  // neither the screen/light targets nor the glass transmission passes can
  // contribute. startHomeReturn() clears this before the staged reveal.
  get isFullyHidden() {
    return this._aboutMode && this._tilesOut.progress === 1 &&
      this._overlayOut.progress === 1 && this._screenUniforms.uScreenOpacity.value === 0;
  }

  get tilesClear() {
    return timingEase(timings.tiles.outEase)(this._tilesOut.progress) >= TILES_CLEAR;
  }

  update(time, delta, camera = null) {
    if (this.gallery && this._projectQuad >= 0.999) this.gallery.entryReady = true;
    this._commitVideoFrame();
    this.gallery?.update(delta || 1 / 60, this._screenUniforms.uVideoAspect.value, this._videoFrameUrl, this._heldVideo);
    this._syncGalleryVideo();
    if (this.gallery?.departing && this.gallery.opacity === 0) {
      this.gallery.dispose();
      this.gallery = null;
    }
    this._pageElapsed += delta || 1 / 60;
    if (this._tilePreview) {
      this._tilePreview.elapsed += delta || 1 / 60;
      if (this._tilePreview.elapsed >= timings.tiles.duration + timings.tiles.previewHold) this._tilesOut.target = 0;
      if (this._tilePreview.elapsed >= timings.tiles.duration * 2 + timings.tiles.previewHold) {
        this._tilePreview = null;
        this.grid.setInteractive(true);
      }
    }
    if (this.testObject) {
      this.testObject.rotation.x = time * 0.0005;
      this.testObject.rotation.y = time * 0.001;
    }

    // Update grid compute shader (camera used for pointer projection)
    if (this.grid) {
      this.grid.update(time, delta, camera);
    }

    this._updateHover(delta);
    this._updateOverlayOut(delta);
    this._updateHomeReturnTail(delta);
    this._updateTilesOut(delta);
    this._updateScreenFade(delta);
  }

  /**
   * Fade the screen plane in/out for about mode, paced like the tiles.
   * @param {number} delta - Seconds
   */
  _updateScreenFade(delta) {
    if (this._homeReturn) return;
    const u = this._screenUniforms.uScreenOpacity;
    const target = this._aboutMode ? 0 : 1;
    const dt = delta || 1 / 60;
    const screenReady = this._pageElapsed >= this.pageTiming.pageScreenDelay;
    const quadTarget = (this._screenHeldForPage || (this._projectMode && screenReady && this._projectMotionReady)) ? 1 : 0;
    this._projectQuad = THREE.MathUtils.clamp(this._projectQuad + (quadTarget ? 1 : -1) * dt / this.pageTiming.pageScreenDuration, 0, 1);
    if (this._aboutMode && !screenReady) return;
    if (this._screenFadeProgress === target) return;

    const step = dt / Math.max(this.pageTiming.pageScreenDuration, 1e-3);
    this._screenFadeProgress = target === 0
      ? Math.max(0, this._screenFadeProgress - step)
      : Math.min(1, this._screenFadeProgress + step);
    const exit = timingEase(timings.pages.screenEase)(1 - this._screenFadeProgress);
    this._screenUniforms.uScreenExit.value = exit;
    u.value = 1 - exit;
    this.screenPlane.visible = u.value > 0;
    this._emitterQuad.visible = this.screenPlane.visible;
  }

  previewTilesOut() {
    if (this._aboutMode || this._projectMode) return;
    this._tilePreview = { elapsed: 0 };
    this._tilesOut.progress = 0;
    this._tilesOut.target = 1;
    this.grid.setHideProgress(0);
    this.grid.setInteractive(false);
  }

  /** Shaft intensity and the video grade share one 0..1, so they fade together. */
  _setScreenIntensity(value) {
    this.shafts.transitionIntensity.value = value;
    this._screenUniforms.uVideoGrade.value = value;
  }

  /**
   * Advance the project-mode tiles scale-out (eased CPU-side; the
   * top-left to bottom-right stagger happens in the compute shader).
   * @param {number} delta - Seconds
   */
  _updateTilesOut(delta) {
    if (this._homeReturn || this._homeReturnTail) return;
    const t = this._tilesOut;
    if (t.progress === t.target) return;

    const step =
      (delta || 1 / 60) / Math.max(timings.tiles.duration, 1e-3);
    t.progress = Math.min(
      1,
      Math.max(0, t.progress + (t.target === 1 ? step : -step)),
    );

    const p = t.progress;
    const hiding = t.target === 1;
    this.grid.compute.uniforms.hideSpread.value = timings.tiles.stagger;
    const tileHide = timingEase(hiding ? timings.tiles.outEase : timings.tiles.inEase)(p);
    this.grid.setHideProgress(tileHide, hiding);
    this._setScreenIntensity(1 - tileHide);
  }

  /**
   * Render the screen to its own render target
   * Call this BEFORE rendering active scenes so tiles can sample it
   * @param {THREE.Camera} camera - The camera to render with
   */
  renderScreen(camera) {
    if (!this.screenTarget || !this.renderer) return;
    this._screenCamera = camera;

    // Keep the screen plane fitted to the grid footprint
    this._fitScreenToGrid(camera);
    const galleryVisible = this.gallery?.visible;
    this.screenPlane.visible = !this._screenHeldForPage && this._screenUniforms.uScreenOpacity.value > 0 && !galleryVisible;
    if (galleryVisible) this.gallery.fit(this.screenPlane, projectLayout(this._viewportWidth, this._viewportHeight, getFlag("touchExperience") || this._viewportWidth <= 700, this._visibleHeight), camera);

    // Sync the area-light quad to the freshly fitted plane
    this.screenLight.updateFromMesh(this.screenPlane);
    // The camera-facing project quad is not an emitter in the room.
    // Gallery visibility hides the room screen immediately. Keep the emitter
    // alive underneath it while the tile-synchronised shaft multiplier fades.
    this.shafts.visibility.value = this._emitterQuad.visible
      ? this._screenUniforms.uScreenOpacity.value * (1 - this._projectQuad)
      : 0;

    // Keep glass tiles sampling the latest screen texture
    // (cheap uniform assignment; survives grid rebuilds and target resizes)
    if (this.grid) {
      this.grid.setScreenTexture(this.screenTexture);
      this._updateScreenRect(camera, this.grid.tileUniforms.screenRect.value);
    }

    const currentTarget = this.renderer.getRenderTarget();
    const currentAutoClear = this.renderer.autoClear;
    const clearColor = this.renderer.getClearColor(_clearColor);
    const clearAlpha = this.renderer.getClearAlpha();

    try {
      this.renderer.autoClear = true;
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setRenderTarget(this.screenLightTarget);
      this.renderer.render(this._emitterScene, this._emitterCamera);
      this.renderer.setRenderTarget(this.screenTarget);
      // Transparent outside the screen for the depth compositor.
      this.renderer.render(this.screenScene, camera);
    } finally {
      this.renderer.setRenderTarget(currentTarget);
      this.renderer.autoClear = currentAutoClear;
      this.renderer.setClearColor(clearColor, clearAlpha);
    }
  }

  _updateScreenRect(camera, rect) {
    this.screenPlane.updateMatrixWorld();
    rect.set(Infinity, Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 4; i++) {
      _screenCorner.set(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, 0)
        .applyMatrix4(this.screenPlane.matrixWorld)
        .project(camera);
      const x = _screenCorner.x * 0.5 + 0.5;
      const y = 0.5 - _screenCorner.y * 0.5;
      rect.set(Math.min(rect.x, x), Math.min(rect.y, y), Math.max(rect.z, x), Math.max(rect.w, y));
    }
  }

  /**
   * Resize render targets
   * @param {number} width
   * @param {number} height
   * @param {number} devicePixelRatio
   */
  resize(width, height, devicePixelRatio = this._devicePixelRatio, visibleHeight = height) {
    this._devicePixelRatio = devicePixelRatio;
    this._viewportWidth = width;
    this._viewportHeight = height;
    this._visibleHeight = visibleHeight;

    // Resize screen target
    this.screenTarget.setSize(
      Math.max(1, Math.floor(width * devicePixelRatio)),
      Math.max(1, Math.floor(height * devicePixelRatio)),
    );

    // The fixed-size emission target is intentionally unaffected by resize.

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

  _overlayDebugTarget(key, uniform) {
    const scene = this;
    return {
      object: {
        // Edit/save the configured value, not the temporary hover/page fade.
        get value() { return scene._overlayOut?.bases?.[key] ?? uniform.value; },
        set value(value) {
          if (scene._overlayOut?.bases) scene._overlayOut.bases[key] = value;
          else uniform.value = value;
        },
      },
      property: "value",
    };
  }

  attachDebug(gui) {
    if (!gui) return;
    const folder = getDebugFolder(gui, "PersistentScene");
    if (folder._debugBound) return;
    folder._debugBound = true;
    bindDebugParams(gui, [{ folder: "PersistentScene/Project", name: "Preview Tiles Out + In", type: "button", onChange: () => this.previewTilesOut() }]);

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
        if (Object.hasOwn(this.gallerySettings, key))
          return { object: this.gallerySettings, property: key };
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

        if (key === "mouseSnapRange") return {
          object: this.grid.config, property: key,
          onChange: value => this.grid.applyParams({ mouseSnapRange: value }),
        };

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
        if (key === "innerRefractEnabled" || key === "enhancedGlassEnabled") {
          return {
            object: this.grid.config,
            property: key,
            onChange: () => this.grid.rebuildMaterial(),
          };
        }
        if (key === "innerRefract")
          return { uniform: this.grid.tileUniforms.innerRefract };
        if (["glassIOR", "glassRoughness", "glassDistance"].includes(key)) {
          return {
            object: this.grid.config,
            property: key,
            onChange: () => this.grid.syncGlassProperties(),
          };
        }
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

        if (key === "interfaceAlpha")
          return this._overlayDebugTarget(key, this.grid.interfaceUniforms.alpha);

        const ifaceMap = {
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
          return this.grid.projectsOverlay
            ? this._overlayDebugTarget(key, this.grid.projectsOverlay.lineUniforms.reveal)
            : null;

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
          return { object: this, property: "_screenBaseZ" };
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
        if (key === "screenVideoSaturation")
          return { uniform: this._screenUniforms.uVideoSaturation };
        if (key === "screenVideoLift")
          return { uniform: this._screenUniforms.uVideoLift };
        if (key === "screenVideoMaxBrightness")
          return { uniform: this._screenUniforms.uVideoMaxBrightness };
        if (key === "screenVideoDisplaySaturation")
          return { uniform: this._screenUniforms.uVideoDisplaySaturation };
        if (key === "screenVideoDisplayGain")
          return { uniform: this._screenUniforms.uVideoDisplayGain };
        if (key === "screenHoverDisplacement")
          return { object: this, property: "_hoverDisplacement" };
        if (Object.hasOwn(this.grid.hideUniforms, key)) return { uniform: this.grid.hideUniforms[key] };

        if (key === "screenLightIntensity")
          return { uniform: this.screenLight.intensity };
        if (key === "screenLightBlur")
          return { uniform: this.screenLight.blur };
        if (key === "screenLightColor")
          return { uniform: this.screenLight.color };
        if (key === "shaftsEnabled")
          return { object: this.shafts, property: "enabled" };
        if (key === "shaftResolution")
          return { object: this.shafts, property: "resolution" };
        if (this.shafts.uniforms[key])
          return { uniform: this.shafts.uniforms[key] };

        return null;
      },
      "PersistentScene",
    );
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    clearTimeout(this._hoverPrepareTimer);
    this.gallery?.dispose();
    this._preparedGallery?.dispose();
    this.shafts?.dispose();
    this.screenLightTarget?.dispose();
    this._emitterQuad?.geometry.dispose();
    this._emitterMaterial?.dispose();
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

    for (const texture of [this._videoTexture, this._heldVideo.texture]) {
      texture?.image?.close?.();
      texture?.dispose();
    }
    this._videoTexture = this._heldVideo.texture = null;
    this._pendingVideoFrame?.image.close?.();
    this._pendingVideoFrame = null;
    for (const channel of this._detailVideos) channel.dispose();
    for (const still of this._stills.values()) still.then(loaded => { loaded?.texture.image.close?.(); loaded?.texture.dispose(); });
    this._videoFallbackTexture?.dispose();
  }
}
