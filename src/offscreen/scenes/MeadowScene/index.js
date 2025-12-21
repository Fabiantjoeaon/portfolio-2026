import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { WaterWithReflection } from "./WaterWithReflection.js";
import { GROUND_Y } from "../../managers/SceneManager.js";
import { createVolumetricFog } from "../../postprocessing/volumetricFog.js";
import { createNoiseTexture2D } from "../../utils/NoiseTexture3D.js";
import loader from "@/offscreen/loader";

export default class MeadowScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = config.name || "MeadowScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3(0, 0, 10),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 80,
    };

    this.water = null;

    // Pre-compute 2D noise texture for volumetric fog (256x256 RGBA)
    this.fogNoiseTexture = createNoiseTexture2D(256, 4, 0.5);

    // Configure volumetric fog - exponential height fog with FBM noise
    // Uses proper world position reconstruction from depth buffer
    this.postprocessingChain = [
      //   createVolumetricFog({
      //     noiseTexture: this.fogNoiseTexture,
      //     fogColor: new THREE.Color(0.9, 0.92, 0.95), // Light blue-white mist
      //     fogColor2: new THREE.Color(0.85, 0.88, 0.92), // Secondary color
      //     fogDensity: 0.012, // Density factor
      //     fogAlpha: 1.0, // Maximum fog opacity
      //     fogSpeed: 0.02, // Animation speed
      //     frequency: 0.025, // Noise frequency (world space)
      //     heightFactor: 0.0025, // Height influence
      //     depthInfluence: 0.7, // How much noise affects depth
      //     fogMinY: GROUND_Y, // Fog only above water surface
      //   }),
    ];

    this.init();

    // Set both background (for clear color) and backgroundNode (for WebGPU rendering)
    this.scene.background = new THREE.Color(0xaaaaaa);
  }

  init() {
    // Create water plane geometry
    const waterGeometry = new THREE.PlaneGeometry(200, 200);

    // Get water normals texture from loader (loaded via common_resources.js)
    const waterNormals = loader.resources.waterNormals?.asset;
    if (waterNormals) {
      waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
    }

    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(3, 3, 3),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    this.cube.position.x = -20;
    this.cube.position.y = 3;
    this.cube.position.z = -50;
    this.scene.add(this.cube);

    // Create custom water with external reflection support
    this.water = new WaterWithReflection(waterGeometry, {
      waterNormals,
      sunDirection: new THREE.Vector3(5, 10, 5).normalize(),
      sunColor: 0xffffff,
      distortionScale: 1.7,
      alpha: 1,
      externalReflectionStrength: 0.7,
    });

    // Position as horizontal floor
    this.water.position.y = GROUND_Y;

    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);

    // Add basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);
  }

  setPersistentScene(renderer, persistentScene, camera, viewport, screenScene) {
    if (!this.water) return;

    if (!this._externalSceneInitialized) {
      const { width, height, devicePixelRatio } = viewport;

      const w = Math.round(width * devicePixelRatio * 0.5);
      const h = Math.round(height * devicePixelRatio * 0.5);
      // Pass both scenes - water will render them both
      this.water.setExternalScenes(
        renderer,
        persistentScene,
        screenScene,
        w,
        h
      );
      this._externalSceneInitialized = true;
    }

    this.water.renderExternalReflection(camera);
  }

  update(time, delta) {
    // Scene update logic
    if (this.cube) {
      this.cube.position.x = Math.sin(time * 0.001) * 20;
    }
  }
}


