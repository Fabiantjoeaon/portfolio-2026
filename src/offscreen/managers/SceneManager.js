import { PostProcessingScene } from "../utils/PostProcessingScene.js";
import { GBuffer } from "../utils/GBuffer.js";
import { CameraController } from "./CameraController.js";
import { getFlag } from "../lib/query.js";

let _nextSceneId = 1;

export const GROUND_Y = -9;

export class SceneManager {
  constructor(
    renderer,
    camera,
    debug = false,
    hidePersistentScene = getFlag("hidePersistentScene")
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
      gbuffer: new GBuffer(width, height, devicePixelRatio),
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
      nextScene?.cameraState
    );
  }

  setMix(value) {
    this.mixValue = Math.min(Math.max(value, 0), 1);
    this.post.material.setMix(this.mixValue);
  }

  setTransitioning(isTransitioning) {
    this.isTransitioning = isTransitioning;
  }

  updateCameraTransition(progress, delta) {
    // Update camera interpolation based on transition progress
    this.cameraController.update(progress, delta);
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

    // Get the shared camera
    const camera = this.camera;

    // Disable autoClear to handle clearing manually per render target
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Render persistent screen FIRST
    // This allows glass tiles to sample it for refraction
    // ═══════════════════════════════════════════════════════════════════════
    if (!this.hidePersistentScene && this.persistent) {
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
          this.persistent.screenScene
        );
      }

      if (next?.sceneObj?.setPersistentScene) {
        next.sceneObj.setPersistentScene(
          this.renderer,
          this.persistent.scene,
          camera,
          this.viewport,
          this.persistent.screenScene
        );
      }

      // Legacy: pass gbuffer for scenes that still use it
      if (prev?.sceneObj?.setPersistentBuffer && this.persistent.gbuffer) {
        prev.sceneObj.setPersistentBuffer(this.persistent.gbuffer);
      }

      if (next?.sceneObj?.setPersistentBuffer && this.persistent.gbuffer) {
        next.sceneObj.setPersistentBuffer(this.persistent.gbuffer);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Render active scenes
    // ═══════════════════════════════════════════════════════════════════════
    if (prev?.update) prev.update(timeMs, delta);
    if (prev) {
      renderer.setRenderTarget(prev.gbuffer.target);

      // Explicitly clear with scene background color
      if (prev.scene.background) {
        renderer.setClearColor(prev.scene.background, 1);
      } else {
        renderer.setClearColor(0x000000, 1);
      }

      renderer.clear();

      // Forward rendering with proper materials/lighting
      renderer.render(prev.scene, camera);
    }

    // Only update and render next scene during transitions
    if (this.isTransitioning && next && next !== prev) {
      if (next.update) next.update(timeMs, delta);

      renderer.setRenderTarget(next.gbuffer.target);

      // Explicitly clear with scene background color
      if (next.scene.background) {
        renderer.setClearColor(next.scene.background, 1);
      } else {
        renderer.setClearColor(0x000000, 1);
      }

      renderer.clear();

      // Forward rendering with proper materials/lighting
      renderer.render(next.scene, camera);
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

    if (prev || next) {
      const pTex = prev?.gbuffer.albedo ?? next?.gbuffer.albedo;
      const nTex = next?.gbuffer.albedo ?? prev?.gbuffer.albedo;

      this.post.material.setInputs({
        prev: pTex,
        next: nTex,
        prevDepth: prev?.gbuffer.depth,
        nextDepth: next?.gbuffer.depth,
        // Don't pass persistent textures - tiles will be rendered on top
        persistent: null,
        persistentDepth: null,
        screen:
          this.hidePersistentScene || !this.persistent
            ? null
            : this.persistent.screenTexture,
        screenDepth:
          this.hidePersistentScene || !this.persistent
            ? null
            : this.persistent.screenDepth,
      });
    }

    // Render post-processing to screen first
    renderer.setRenderTarget(null);
    renderer.render(this.post.scene, this.post.camera);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Render glass tiles on top of the composited scene
    // Tiles use viewportMipTexture() to sample what's been rendered to screen
    // ═══════════════════════════════════════════════════════════════════════
    if (!this.hidePersistentScene && this.persistent) {
      this.persistent.update(timeMs, delta);

      const isEmpty = this.persistent.isEmpty();
      

      if (!isEmpty) {
        // IMPORTANT: Disable autoClear so we don't clear the color buffer
        const savedAutoClear = renderer.autoClear;
        const savedAutoClearColor = renderer.autoClearColor;
        const savedAutoClearDepth = renderer.autoClearDepth;
        
        renderer.autoClear = false;
        renderer.autoClearColor = false;
        renderer.autoClearDepth = true; // Clear depth so tiles aren't occluded by post-processing quad
        
        // Clear only depth buffer to prevent occlusion by post-processing quad
        renderer.setRenderTarget(null);
        renderer.clearDepth();
        
        // Render tiles directly to screen (no render target)
        // This allows viewportMipTexture() to sample the post-processed scene
        renderer.render(this.persistent.scene, camera);
        
        // Restore autoClear settings
        renderer.autoClear = savedAutoClear;
        renderer.autoClearColor = savedAutoClearColor;
        renderer.autoClearDepth = savedAutoClearDepth;
      }
    }
  }
}

