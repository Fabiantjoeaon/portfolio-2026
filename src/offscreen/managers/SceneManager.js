import { PostProcessingScene } from "../utils/PostProcessingScene.js";
import { GBuffer } from "../utils/GBuffer.js";
import { CameraController } from "./CameraController.js";
import { getFlag } from "../lib/query.js";
import { LinearSRGBColorSpace, NoToneMapping } from "three/webgpu";

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
        ? Math.min(window.devicePixelRatio || 1, 2)
        : 1;

    this.viewport = {
      width,
      height,
      devicePixelRatio,
    };

    this.scenes = new Map(); // id -> { scene, cameraState, update, gbuffer }
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
    const { width, height, devicePixelRatio } = this.viewport;

    this.scenes.set(id, {
      scene: sceneObj.scene,
      cameraState: sceneObj.cameraState,
      update: sceneObj.update?.bind?.(sceneObj) ?? (() => {}),
      sceneObj,
      gbuffer: new GBuffer(width, height, devicePixelRatio, sceneObj.renderTargetOptions),
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

  setActivePair(prevId, nextId) {
    this.activePrevId = prevId;
    this.activeNextId = nextId;

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

  resize({ width, height, devicePixelRatio }) {
    this.viewport = { width, height, devicePixelRatio };

    // Resize all scene gbuffers
    for (const [, entry] of this.scenes) {
      entry.gbuffer.resize(width, height, devicePixelRatio);
    }

    // Update shared camera aspect
    this.cameraController.setAspect(width / height);

    // Resize persistent scene (includes gbuffer and background target)
    if (this.persistent) {
      this.persistent.resize(width, height, devicePixelRatio);
    }
  }

  render(timeMs, delta) {
    const renderer = this.renderer;

    // Skip rendering if device is not valid
    if (renderer.isDeviceValid === false) return;

    const prev = this.scenes.get(this.activePrevId);
    const next = this.scenes.get(this.activeNextId);
    const renderPersistent = !this.hidePersistentScene && this.persistent && !this.persistent.isFullyHidden;

    // Get the shared camera
    const camera = this.camera;

    // Disable autoClear to handle clearing manually per render target
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Render persistent screen FIRST
    // This allows glass tiles to sample it for refraction
    // ═══════════════════════════════════════════════════════════════════════
    if (renderPersistent) {
      this.persistent.renderScreen(camera);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Pass persistent scenes to active scenes for reflections
    // Pass both the main scene (tiles) and screen scene (gradient plane)
    // ═══════════════════════════════════════════════════════════════════════
    if (this.persistent) {
      if (prev?.sceneObj?.setPersistentScene) {
        prev.sceneObj.setPersistentScene(
          this.renderer,
          this.persistent.scene,
          camera,
          this.viewport,
          this.persistent.screenScene,
        );
      }

      if (this.isTransitioning && next !== prev && next?.sceneObj?.setPersistentScene) {
        next.sceneObj.setPersistentScene(
          this.renderer,
          this.persistent.scene,
          camera,
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
      renderer.setRenderTarget(prev.gbuffer.target);

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
    }

    // Only update and render next scene during transitions
    if (this.isTransitioning && next && next !== prev) {
      if (next.update) next.update(timeMs, delta);
      next.sceneObj?.renderBeforeScene?.(renderer, camera, this.viewport);

      renderer.setRenderTarget(next.gbuffer.target);

      // Explicitly clear with scene background color
      if (next.scene.background) {
        renderer.setClearColor(next.scene.background, 1);
      } else {
        renderer.setClearColor(0x000000, 1);
      }

      renderer.autoClear = true;
      renderer.render(next.scene, camera);
      renderer.autoClear = false;
    }

    // Restore autoClear
    renderer.autoClear = prevAutoClear;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Composite scenes in post-processing (renders to screen)
    // ═══════════════════════════════════════════════════════════════════════

    // Ensure camera matrices are up-to-date before passing to post-processing
    camera.updateMatrixWorld(true);

    // Update camera data for volumetric effects
    this.post.material.setCameraData(camera);
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

    if (prev || next) {
      const pTex = prev?.gbuffer.albedo ?? next?.gbuffer.albedo;
      const renderedNext = this.isTransitioning ? next : prev;
      const nTex = renderedNext?.gbuffer.albedo ?? pTex;

      this.post.material.setInputs({
        prev: pTex,
        next: nTex,
        prevDepth: prev?.gbuffer.depth,
        nextDepth: renderedNext?.gbuffer.depth,
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
    if (renderPersistent) this.persistent.update(timeMs, delta, camera);
    const renderForeground = renderPersistent && !this.persistent.isEmpty();
    renderer.setRenderTarget(null);
    if (renderForeground) {
      this.persistent.scene.add(this.post.quad);
      try {
        renderer.autoClear = true;
        renderer.render(this.persistent.scene, camera);
      } finally {
        this.post.scene.add(this.post.quad);
        renderer.autoClear = prevAutoClear;
      }
    } else if (directOutput) {
      const toneMapping = renderer.toneMapping;
      const colorSpace = renderer.outputColorSpace;
      try {
        renderer.toneMapping = NoToneMapping;
        renderer.outputColorSpace = LinearSRGBColorSpace;
        renderer.render(this.post.scene, this.post.camera);
      } finally {
        renderer.toneMapping = toneMapping;
        renderer.outputColorSpace = colorSpace;
      }
    } else {
      renderer.render(this.post.scene, this.post.camera);
    }

  }
}
