import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { fog, rangeFogFactor, color } from "three/tsl";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { IceGround } from "./IceGround.js";
import { GROUND_Y } from "../../managers/SceneManager.js";
import { store } from "@/offscreen/store";
import loader from "@/offscreen/loader";

const FOG_COLOR = 0x9aa4ad;

export default class IceScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = config.name || "IceScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3(0, 7, 70),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 25,
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
      parallaxScale: 0.35,
      colorIntensity: 3.0,
      reflectionStrength: 0.55,
    });

    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = GROUND_Y;
    this.scene.add(this.ground);

    // Cold-toned lighting; the env map (set up lazily) does most of the work
    const ambientLight = new THREE.AmbientLight(0xcdd6de, 0.4);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xdfeaf5, 1.2);
    directionalLight.position.set(5, 12, 4);
    this.scene.add(directionalLight);
  }

  // The parallax example is lit by an HDR environment; RoomEnvironment is the
  // in-repo stand-in (same approach as DemoScene). Lazy: store.gl isn't
  // available at construction time.
  _setupEnvironment() {
    if (this._envInitialized || !store.gl) return;
    this._envInitialized = true;

    const pmremGenerator = new THREE.PMREMGenerator(store.gl);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment()
    ).texture;
    this.scene.environmentIntensity = 0.6;
    pmremGenerator.dispose();
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
        h
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
