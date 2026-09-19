import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { fog, rangeFogFactor, color } from "three/tsl";
import { IceGround } from "./IceGround.js";
import { createOvercastEnvironment } from "./OvercastEnvironment.js";
import { GROUND_Y } from "../../managers/SceneManager.js";
import { store } from "@/offscreen/store";
import loader from "@/offscreen/loader";

const FOG_COLOR = 0x272b30;

export default class IceScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = config.name || "IceScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3(0, 7, 60),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 35,
    };

    this.ground = null;

    this.init();

    // Fog swallows the ground plane edges; background matches so the
    // horizon blends seamlessly
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fogNode = fog(color(FOG_COLOR), rangeFogFactor(60, 200));
  }

  init() {
    // Large plane so the fog fades it out well before its edges (radius 250
    // vs fog far 140)
    const groundGeometry = new THREE.PlaneGeometry(500, 500);

    this.ground = new IceGround(groundGeometry, {
      iceColor: loader.resources.iceColor?.asset,
      iceBottom: loader.resources.iceBottom?.asset,
      iceRoughness: loader.resources.iceRoughness?.asset,
      iceDisplacement: loader.resources.iceDisplacement?.asset,
      iceNormal: loader.resources.iceNormal?.asset,
      // Example density: uvScale 3 on a 50-unit circle ≈ one repeat per ~16
      // units; keep the same tile size on this 500-unit plane
      uvScale: 30.0,
      // Deeper parallax + example-like color gain: this is where the sense
      // of frozen depth comes from (the example runs colorIntensity ~5)
      parallaxScale: 0.5,
      colorIntensity: 1.4,
      reflectionStrength: 1.0,
      normalScale: 2.2,
    });

    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = GROUND_Y;
    this.scene.add(this.ground);

    // Fill only — specular comes from the overcast env, not a hard key light
    const ambientLight = new THREE.AmbientLight(0xcdd6de, 0.1);
    this.scene.add(ambientLight);
  }

  _setupEnvironment() {
    if (this._envInitialized || !store.gl) return;
    this._envInitialized = true;

    const envScene = createOvercastEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(store.gl);
    this.scene.environment = pmremGenerator.fromScene(envScene).texture;
    this.scene.environmentIntensity = 1.05;
    pmremGenerator.dispose();

    envScene.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
  }

  update() {
    this._setupEnvironment();
  }

  setPersistentScene(renderer, persistentScene, camera, viewport, screenScene) {
    if (!this.ground) return;

    if (!this._externalSceneInitialized) {
      const { width, height, devicePixelRatio } = viewport;

      const w = Math.round(width * devicePixelRatio * 0.5);
      const h = Math.round(height * devicePixelRatio * 0.5);
      this.ground.setExternalScenes(
        renderer,
        persistentScene,
        screenScene,
        w,
        h,
      );
      this._externalSceneInitialized = true;
    }

    this.ground.renderExternalReflection(camera);
  }

  dispose() {
    if (this.ground) {
      this.ground.dispose();
      this.ground = null;
    }
  }
}
