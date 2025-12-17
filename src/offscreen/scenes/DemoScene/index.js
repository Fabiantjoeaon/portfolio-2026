import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
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

    this.cameraState = {
      position: new THREE.Vector3(0, 5, 25),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 75,
    };

    this.demo = null;

    this.init();

    this.scene.background = new THREE.Color(0x121212);
  }

  init() {
    // Create the Demo component and add it to our scene
    this.demo = new Demo({ scene: this.scene });

    // Setup environment
    this.setupEnvironment();

    // Add ambient lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);
  }

  setupEnvironment() {
    const environment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(store.gl);

    this.scene.environment = pmremGenerator.fromScene(environment).texture;
    this.scene.environmentIntensity = 0.5;
    pmremGenerator.dispose();
  }

  update(time, delta) {
    // The Demo component handles its own updates via onRaf
    // But we can add scene-level updates here if needed
    if (this.demo) {
      this.demo.updateScene(time, delta);
    }
  }

  dispose() {
    if (this.demo) {
      this.demo.dispose();
      this.demo = null;
    }
  }
}
