import { PostProcessingScene } from "../utils/PostProcessingScene.js";
import { GBuffer } from "../utils/GBuffer.js";
import { CameraController } from "./CameraController.js";
import { getFlag } from "../lib/query.js";
import { store } from "../store.js";
import { params } from "../params.js";
import { renderSetting } from "@/shared/tiers.js";
import { clampDpr } from "@/shared/flags";
import {
  HalfFloatType,
  LinearSRGBColorSpace,
  NoToneMapping,
  NodeMaterial,
  QuadMesh,
  RenderTarget,
} from "three/webgpu";
import { renderOutput, texture } from "three/tsl";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";

let _nextSceneId = 1;

export const GROUND_Y = -14;

export class SceneManager {
  constructor(
    renderer,
    camera,
    debug = false,
    hidePersistentScene = getFlag("hidePersistentScene"),
  ) {
    this.renderer = renderer;
    this.externalCamera = camera;
    this.hidePersistentScene = hidePersistentScene;

    const width = typeof window !== "undefined" ? window.innerWidth : 1920;
    const height = typeof window !== "undefined" ? window.innerHeight : 1080;
    const devicePixelRatio =
      typeof window !== "undefined"
        ? clampDpr(window.devicePixelRatio)
        : 1;

    this.viewport = {
      width,
      height,
      devicePixelRatio,
    };

    this.scenes = new Map(); // id -> { scene, cameraState, update, gbuffer }
    // At most two scenes render at once, so scenes with the same target
    // options share two full-resolution gbuffers instead of owning one each.
    this._gbufferPools = new Map();
    this.activePrevId = null;
    this.activeNextId = null;
    this.mixValue = 0.0;
    this.isTransitioning = false;

    // Create shared camera controller
    this.cameraController = new CameraController(renderer, debug);
    this.cameraController.setAspect(width / height);

    // Persistent scene will be set externally
    this.persistent = null;

    this.post = new PostProcessingScene();

    // Final frames render here, then one output pass tone maps (and FXAAs)
    // them to the canvas. Its samples follow the AA mode, which the canvas
    // framebuffer can't change after creation.
    this.antialias = params.Rendering.antialias.value;
    this._outputTarget = new RenderTarget(
      Math.max(1, Math.floor(width * devicePixelRatio)),
      Math.max(1, Math.floor(height * devicePixelRatio)),
      { type: HalfFloatType, samples: this._sceneSamples() },
    );
    this._outputPasses = new Map();
  }

  _sceneSamples() {
    return this.antialias === "msaa" ? renderSetting("msaa") : 0;
  }

  setAntialias(mode) {
    this.antialias = mode;
    const samples = this._sceneSamples();
    this._outputTarget.samples = samples;
    for (const { options, slots, reduced } of this._gbufferPools.values()) {
      if (options?.samples !== undefined) continue;
      for (const { gbuffer } of slots) gbuffer.target.samples = samples;
      for (const gbuffer of Object.values(reduced)) gbuffer.target.samples = samples;
    }
  }

  _outputPass(key) {
    let pass = this._outputPasses.get(key);
    if (pass) return pass;
    const source = texture(this._outputTarget.texture);
    const color = key === "fxaa-direct"
      ? source
      : renderOutput(source, this.renderer.toneMapping, this.renderer.outputColorSpace);
    const material = new NodeMaterial();
    material.name = `Output_${key}`;
    material.fragmentNode = key === "tonemap" ? color : fxaa(color);
    pass = new QuadMesh(material);
    this._outputPasses.set(key, pass);
    return pass;
  }

  /**
   * Set the persistent scene instance
   */
  setPersistentScene(persistentScene) {
    this.persistent = persistentScene;
  }

  /**
   * Get the shared camera from the controller
   * Always use CameraController's camera since it manages scene transitions
   */
  get camera() {
    return this.cameraController.camera;
  }

  addScene(sceneObj) {
    const id = _nextSceneId++;
    const options = sceneObj.renderTargetOptions;
    // Global chains (e.g. N8AO) bind the raw gbuffer textures, so those
    // scenes keep a stable target of their own.
    const poolKey = sceneObj.postprocessingChain?.length
      ? `own:${id}`
      : JSON.stringify(options ?? {});
    if (!this._gbufferPools.has(poolKey)) {
      this._gbufferPools.set(poolKey, {
        options,
        slots: [],
        reduced: {},
        reducible: !sceneObj.postprocessingChain?.length,
      });
    }

    this.scenes.set(id, {
      scene: sceneObj.scene,
      cameraState: sceneObj.cameraState,
      update: sceneObj.update?.bind?.(sceneObj) ?? (() => {}),
      sceneObj,
      gbuffer: null,
      pool: this._gbufferPools.get(poolKey),
    });

    if (this.activePrevId === null) {
      this.activePrevId = id;
      // Set initial camera state from first scene
      if (sceneObj.cameraState) {
        this.cameraController.snapToState(sceneObj.cameraState);
      }
    } else if (this.activeNextId === null) {
      this.activeNextId = id;
    }

    return id;
  }

  _acquireGBuffer(id, otherId) {
    const entry = this.scenes.get(id);
    if (!entry || entry.gbuffer) return;
    const { slots, options } = entry.pool;
    let slot = slots.find((s) => s.owner !== otherId);
    if (!slot && slots.length < 2) {
      const { width, height, devicePixelRatio } = this.viewport;
      slot = {
        gbuffer: new GBuffer(width, height, devicePixelRatio, { samples: this._sceneSamples(), ...options }),
        owner: null,
      };
      slots.push(slot);
    }
    const previous = this.scenes.get(slot.owner);
    if (previous) previous.gbuffer = null;
    slot.owner = id;
    entry.gbuffer = slot.gbuffer;
  }

  _bindGBuffers() {
    this._acquireGBuffer(this.activePrevId, this.activeNextId);
    this._acquireGBuffer(this.activeNextId, this.activePrevId);
  }

  /**
   * Reduced gbuffer for one wipe role, keyed by its tier setting
   * ("incomingScale" | "outgoingScale"). Only one scene fills each role, so
   * one per pool is enough.
   */
  _wipeGBuffer(entry, key) {
    const pool = entry.pool;
    const scale = renderSetting(key);
    if (scale >= 1 || !pool.reducible) return entry.gbuffer;
    if (!pool.reduced[key]) {
      const { width, height, devicePixelRatio } = this.viewport;
      pool.reduced[key] = new GBuffer(width, height, devicePixelRatio * scale, {
        samples: this._sceneSamples(),
        ...pool.options,
      });
    }
    return pool.reduced[key];
  }

  /** 0 → 1 across the tier's wipe span for `key`, or null when it has none. */
  _wipeRamp(key) {
    const span = renderSetting(key);
    if (!span) return null;
    const [start, end] = span;
    return Math.min(Math.max((this.mixValue - start) / Math.max(end - start, 1e-3), 0), 1);
  }

  _setChainStrength(chain, value) {
    for (const effect of chain ?? []) {
      if (effect.strength) effect.strength.value = value;
    }
  }

  setActivePair(prevId, nextId) {
    this.activePrevId = prevId;
    this.activeNextId = nextId;
    this._bindGBuffers();

    // Set up camera transition states from prev scene to next scene
    const prevScene = this.scenes.get(prevId);
    const nextScene = this.scenes.get(nextId);

    this.cameraController.setTransitionStates(
      prevScene?.cameraState,
      nextScene?.cameraState,
    );
  }

  setMix(value) {
    this.mixValue = Math.min(Math.max(value, 0), 1);
    this.post.material.setMix(this.mixValue);
  }

  setTransitioning(isTransitioning) {
    this.isTransitioning = isTransitioning;
  }

  updateCameraTransition(progress, delta, ease) {
    // Update camera interpolation based on transition progress
    this.cameraController.update(progress, delta, ease);
  }

  resize({ width, height, visibleHeight = height, devicePixelRatio }) {
    this.viewport = { width, height, devicePixelRatio };

    for (const { slots, reduced } of this._gbufferPools.values()) {
      for (const { gbuffer } of slots) gbuffer.resize(width, height, devicePixelRatio);
      for (const [key, gbuffer] of Object.entries(reduced)) {
        gbuffer.resize(width, height, devicePixelRatio * renderSetting(key));
      }
    }
    this._outputTarget.setSize(
      Math.max(1, Math.floor(width * devicePixelRatio)),
      Math.max(1, Math.floor(height * devicePixelRatio)),
    );

    // Update shared camera aspect
    this.cameraController.setAspect(width / height);

    // Resize persistent scene (includes gbuffer and background target)
    if (this.persistent) {
      this.persistent.resize(width, height, devicePixelRatio, visibleHeight);
    }
  }

  render(timeMs, delta) {
    const renderer = this.renderer;

    // Skip rendering if device is not valid
    if (renderer.isDeviceValid === false) return;

    this._bindGBuffers();
    store.renderFrame++;
    const prev = this.scenes.get(this.activePrevId);
    const next = this.scenes.get(this.activeNextId);
    const renderPersistent = !this.hidePersistentScene && this.persistent && !this.persistent.isFullyHidden;
    const incoming = this.isTransitioning && prev && next && next !== prev ? next : null;
    // Tier wipe savings only apply when neither side opts out.
    const optimized = incoming && prev.sceneObj?.optimizedWipes !== false &&
      incoming.sceneObj?.optimizedWipes !== false;
    const incomingGBuffer = incoming && (optimized && this.mixValue < renderSetting("incomingScaleFrom")
      ? this._wipeGBuffer(incoming, "incomingScale")
      : incoming.gbuffer);
    const outgoingGBuffer = optimized && this.mixValue >= renderSetting("outgoingScaleFrom")
      ? this._wipeGBuffer(prev, "outgoingScale")
      : prev?.gbuffer;
    const shownGBuffer = incomingGBuffer ?? (this.isTransitioning ? next : prev)?.gbuffer;
    const incomingRamp = optimized ? this._wipeRamp("incomingExtras") : null;
    const outgoingRamp = optimized ? this._wipeRamp("outgoingExtras") : null;
    const incomingExtras = incomingRamp ?? 1;
    const outgoingExtras = outgoingRamp === null ? 1 : 1 - outgoingRamp;

    // Get the shared camera
    const camera = this.camera;
    // Page wipes zoom each scene through its own camera; the grid and screen
    // belong to home, so they follow whichever camera home is using.
    const zoom = this.cameraController.zoom.direction;
    const nextCamera = zoom ? this.cameraController.nextCamera : camera;
    const persistentCamera = zoom < 0 ? nextCamera : camera;

    // Disable autoClear to handle clearing manually per render target
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Render persistent screen FIRST
    // This allows glass tiles to sample it for refraction
    // ═══════════════════════════════════════════════════════════════════════
    if (renderPersistent) {
      const screenLit = [prev, this.isTransitioning ? next : null]
        .some((entry) => entry && entry.sceneObj?.screenLit !== false);
      this.persistent.setGalleryBackdrop(shownGBuffer?.albedo);
      this.persistent.renderScreen(persistentCamera, screenLit);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Pass persistent scenes to active scenes for reflections
    // Pass both the main scene (tiles) and screen scene (gradient plane)
    // ═══════════════════════════════════════════════════════════════════════
    if (this.persistent) {
      if (prev?.sceneObj?.setPersistentScene && outgoingExtras === 1) {
        prev.sceneObj.setPersistentScene(
          this.renderer,
          this.persistent.scene,
          camera,
          this.viewport,
          this.persistent.screenScene,
        );
      }

      if (incoming?.sceneObj?.setPersistentScene && incomingExtras > 0) {
        incoming.sceneObj.setPersistentScene(
          this.renderer,
          this.persistent.scene,
          nextCamera,
          this.viewport,
          this.persistent.screenScene,
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Render active scenes
    // ═══════════════════════════════════════════════════════════════════════
    if (prev?.update) prev.update(timeMs, delta);
    if (prev) {
      prev.sceneObj?.renderBeforeScene?.(renderer, camera, this.viewport,
        renderPersistent && !this.isTransitioning ? this.persistent : null);
      renderer.setRenderTarget(outgoingGBuffer.target);

      // Explicitly clear with scene background color
      if (prev.scene.background) {
        renderer.setClearColor(prev.scene.background, 1);
      } else {
        renderer.setClearColor(0x000000, 1);
      }

      // Clear in the scene's render pass rather than a separate clear pass.
      renderer.autoClear = true;
      renderer.render(prev.scene, camera);
      renderer.autoClear = false;
      prev.sceneObj?.renderAfterScene?.(renderer, camera, outgoingGBuffer, this.viewport);
    }

    // Only update and render next scene during transitions
    if (incoming) {
      if (next.update) next.update(timeMs, delta);
      next.sceneObj?.renderBeforeScene?.(renderer, nextCamera, this.viewport);

      renderer.setRenderTarget(incomingGBuffer.target);

      // Explicitly clear with scene background color
      if (next.scene.background) {
        renderer.setClearColor(next.scene.background, 1);
      } else {
        renderer.setClearColor(0x000000, 1);
      }

      renderer.autoClear = true;
      renderer.render(next.scene, nextCamera);
      renderer.autoClear = false;
      next.sceneObj?.renderAfterScene?.(renderer, nextCamera, incomingGBuffer, this.viewport);
    }

    // Restore autoClear
    renderer.autoClear = prevAutoClear;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Composite scenes in post-processing (renders to screen)
    // ═══════════════════════════════════════════════════════════════════════

    // Ensure camera matrices are up-to-date before passing to post-processing
    camera.updateMatrixWorld(true);

    // Update camera data for volumetric effects
    this.post.material.setCameraData(camera, nextCamera);
    if (!this.isTransitioning) {
      this.post.material.setPostprocessingChain(prev?.sceneObj?.postprocessingChain);
    }
    const directOutput = !renderPersistent && !this.isTransitioning && prev?.sceneObj?.combineOutputPass;
    this.post.material.setOutputTransform(
      directOutput ? renderer.toneMapping : null,
      directOutput ? renderer.outputColorSpace : null,
    );
    this.post.material.setScenePostprocessing(
      prev?.sceneObj?.scenePostprocessingChain,
      this.isTransitioning
        ? next?.sceneObj?.scenePostprocessingChain
        : prev?.sceneObj?.scenePostprocessingChain,
      this.isTransitioning,
    );
    this._setChainStrength(prev?.sceneObj?.scenePostprocessingChain, outgoingExtras);
    if (incoming) this._setChainStrength(incoming.sceneObj?.scenePostprocessingChain, incomingExtras);

    if (prev || next) {
      const pTex = outgoingGBuffer?.albedo ?? next?.gbuffer.albedo;
      const nTex = shownGBuffer?.albedo ?? pTex;

      this.post.material.setInputs({
        prev: pTex,
        next: nTex,
        prevDepth: outgoingGBuffer?.depth,
        nextDepth: shownGBuffer?.depth,
        // Don't pass persistent textures - tiles will be rendered on top
        persistent: null,
        persistentDepth: null,
        screen:
          !renderPersistent
            ? null
            : this.persistent.screenTexture,
        screenDepth:
          !renderPersistent
            ? null
            : this.persistent.screenDepth,
      });
    }
    this.post.quad.material = this.post.material.material;

    // Draw the composite as the opaque background of the foreground scene.
    // three-blocks transmission snapshots it before drawing the glass, so
    // both share one HDR framebuffer and one final output transform.
    if (renderPersistent) this.persistent.update(timeMs, delta, persistentCamera);
    const renderForeground = renderPersistent && !this.persistent.isEmpty();
    const fxaaOn = this.antialias === "fxaa";
    const outputPass = directOutput
      ? fxaaOn ? this._outputPass("fxaa-direct") : null
      : this._outputPass(fxaaOn ? "fxaa" : "tonemap");
    renderer.setRenderTarget(outputPass ? this._outputTarget : null);
    if (renderForeground) {
      // Shafts join only this pass: reflections render the same scene with
      // mirrored cameras, where the canvas depth reconstruction is invalid.
      const shafts = this.persistent.shafts.prepare(
        persistentCamera,
        outgoingGBuffer?.depth ?? next?.gbuffer.depth,
        shownGBuffer?.depth,
        this.post.material.mixNode,
        this.viewport,
      );
      this.persistent.scene.add(this.post.quad);
      if (shafts) this.persistent.scene.add(shafts);
      try {
        renderer.autoClear = true;
        renderer.render(this.persistent.scene, persistentCamera);
      } finally {
        this.post.scene.add(this.post.quad);
        if (shafts) this.persistent.scene.remove(shafts);
        renderer.autoClear = prevAutoClear;
      }
    } else if (outputPass) {
      renderer.render(this.post.scene, this.post.camera);
    } else {
      this._beginCanvasOutput();
      try {
        renderer.render(this.post.scene, this.post.camera);
      } finally {
        this._endCanvasOutput();
      }
    }

    if (outputPass) {
      renderer.setRenderTarget(null);
      this._beginCanvasOutput();
      try {
        outputPass.render(renderer);
      } finally {
        this._endCanvasOutput();
      }
    }
  }

  // The pass applies its own output transform; without one the renderer
  // draws straight to the canvas instead of via its internal framebuffer.
  _beginCanvasOutput() {
    this._toneMapping = this.renderer.toneMapping;
    this._colorSpace = this.renderer.outputColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
  }

  _endCanvasOutput() {
    this.renderer.toneMapping = this._toneMapping;
    this.renderer.outputColorSpace = this._colorSpace;
  }
}
