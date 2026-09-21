import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { WorldPositionTransition } from "../../transitions/WorldPositionTransition.js";
import { store } from "@/offscreen/store";
import { Demo } from "./Demo.js";

/**
 * DemoScene - A scene showcasing the SPH fluid simulation and transmission material
 */
export default class DemoScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = config.name || "DemoScene";
    this.scene = new THREE.Scene();

    this.transition = new WorldPositionTransition();

    this.cameraState = {
      position: new THREE.Vector3(0, 5, 25),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 75,
    };

    this.demo = null;
    this._initialized = false;

    // Brighter background for visibility
    this.scene.background = new THREE.Color(0x334455);

    // Add basic lighting (doesn't require store.gl)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);
  }

  /**
   * Lazy initialization - called on first update when store.gl is available
   */
  _lazyInit() {
    if (this._initialized || !store.gl) return;
    this._initialized = true;

    try {
      // Create the Demo component and add it to our scene
      this.demo = new Demo({ scene: this.scene, screenLight: this.screenLight });

      // Setup environment
      this.setupEnvironment();
    } catch (error) {
      console.error("DemoScene initialization error:", error);
    }
  }

  setupEnvironment() {
    if (!store.gl) return;

    const environment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(store.gl);

    this.scene.environment = pmremGenerator.fromScene(environment).texture;
    this.scene.environmentIntensity = 0.5;
    pmremGenerator.dispose();
  }

  update(time, delta) {
    // Lazy init on first update (store.gl is guaranteed to be available)
    if (!this._initialized) {
      this._lazyInit();
    }

    // Update the Demo component
    if (this.demo) {
      this.demo.updateScene(time, delta);
    }
  }

  dispose() {
    if (this.demo) {
      this.demo.dispose();
      this.demo = null;
    }
    this._initialized = false;
  }
}

