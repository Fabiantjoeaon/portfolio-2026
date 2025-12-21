import * as THREE from "three/webgpu";
import { SwipeTransition } from "../transitions/SwipeTransition.js";

export default class BaseScene {
  constructor(config = {}) {
    this.name = config.name || "BaseScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3(0, 0, 25),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 100,
    };

    this.transition = new SwipeTransition();
    this.postprocessingChain = null;
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

  dispose() {
    // Override in subclasses for cleanup
  }
}


