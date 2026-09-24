import * as THREE from "three/webgpu";
import { WorldPositionTransition } from "../transitions/WorldPositionTransition.js";
import { attachSceneDebug } from "@/offscreen/debug/bindDebugParams";

export default class BaseScene {
  constructor(config = {}) {
    this.name = config.name || "BaseScene";
    this.scene = new THREE.Scene();

    // Textured LTC area light driven by the persistent screen (optional)
    this.screenLight = config.screenLight ?? null;

    this.cameraState = {
      position: new THREE.Vector3(0, 0, 25),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 100,
      hoverPos: new THREE.Vector3(1, 1, 0),
      hoverRate: 0.05,
    };

    this.transition = new WorldPositionTransition();
    this.postprocessingChain = null;
    // Depth-dependent effects evaluated in this scene before the transition.
    this.scenePostprocessingChain = null;
  }

  update(time, delta) {
    // Override in subclasses
  }

  /**
   * Called when persistent scene is available for reflections
   */
  setPersistentScene(renderer, persistentScene, camera, viewport, screenScene) {
    // Override in subclasses that need reflections
  }

  /**
   * Called when persistent gbuffer is available
   */
  setPersistentBuffer(gbuffer) {
    // Override in subclasses
  }

  /**
   * Bind live Inspector controls from `src/offscreen/params.js`.
   * Override and call `bindParamGroup(gui, params.YourScene, resolve, "YourScene")`.
   */
  attachDebug(gui) {
    if (!gui || !this.debugParams?.length) return;
    attachSceneDebug(gui, this, this.debugParams);
  }

  dispose() {
    // Override in subclasses for cleanup
  }
}


