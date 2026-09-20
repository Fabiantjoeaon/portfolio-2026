import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { fog, rangeFogFactor, color } from "three/tsl";
import { IceGround } from "./IceGround.js";
import { createOvercastEnvironment } from "./OvercastEnvironment.js";
import { GROUND_Y } from "../../managers/SceneManager.js";
import { store } from "@/offscreen/store";
import loader from "@/offscreen/loader";
import { params, paramValues } from "@/offscreen/params";

const ice = paramValues(params.IceScene);

export default class IceScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = config.name || "IceScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3().fromArray(ice.position),
      lookAt: new THREE.Vector3().fromArray(ice.lookAt),
      fov: ice.fov,
    };

    this.ground = null;

    this.init();

    this.scene.background = new THREE.Color(ice.fogColor);
    this.scene.fogNode = fog(
      color(ice.fogColor),
      rangeFogFactor(ice.fogNear, ice.fogFar),
    );
  }

  init() {
    const groundGeometry = new THREE.PlaneGeometry(500, 500);

    this.ground = new IceGround(groundGeometry, {
      iceColor: loader.resources.iceColor?.asset,
      iceBottom: loader.resources.iceBottom?.asset,
      iceRoughness: loader.resources.iceRoughness?.asset,
      iceDisplacement: loader.resources.iceDisplacement?.asset,
      iceNormal: loader.resources.iceNormal?.asset,
      uvScale: ice.uvScale,
      parallaxScale: ice.parallaxScale,
      colorIntensity: ice.colorIntensity,
      reflectionStrength: ice.reflectionStrength,
      normalScale: ice.normalScale,
    });

    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = GROUND_Y;
    this.scene.add(this.ground);

    const ambientLight = new THREE.AmbientLight(
      ice.ambientColor,
      ice.ambientIntensity,
    );
    this.scene.add(ambientLight);
  }

  _setupEnvironment() {
    if (this._envInitialized || !store.gl) return;
    this._envInitialized = true;

    const envScene = createOvercastEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(store.gl);
    this.scene.environment = pmremGenerator.fromScene(envScene).texture;
    this.scene.environmentIntensity = ice.environmentIntensity;
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
