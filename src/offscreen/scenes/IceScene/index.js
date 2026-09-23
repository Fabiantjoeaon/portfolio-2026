import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { IceCave } from "./IceCave.js";
import { createVolumetricFog } from "../../postprocessing/volumetricFog.js";
import { createNoiseTexture2D } from "../../utils/NoiseTexture3D.js";
import { IceGround } from "./IceGround.js";
import { createOvercastEnvironment } from "./OvercastEnvironment.js";
import { GROUND_Y } from "../../managers/SceneManager.js";
import { store } from "@/offscreen/store";
import loader from "@/offscreen/loader";
import { params, paramValues } from "@/offscreen/params";
import {
  bindParamGroup,
  getDebugFolder,
} from "@/offscreen/debug/bindDebugParams";

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
    this._fogSteps = ice.fogSteps;

    this.init();

    this.scene.background = new THREE.Color(ice.background);
    this.fogNoiseTexture = createNoiseTexture2D(128, 4);
    this._buildFog();
    this.scenePostprocessingChain = [this.volumetricFog];
  }

  _materialOptions(overrides = {}) {
    return {
      iceColor: loader.resources.iceColor?.asset,
      iceBottom: loader.resources.iceBottom?.asset,
      iceRoughness: loader.resources.iceRoughness?.asset,
      iceDisplacement: loader.resources.iceDisplacement?.asset,
      iceNormal: loader.resources.iceNormal?.asset,
      tint: ice.tint,
      roughnessScale: ice.roughnessScale,
      roughnessBias: ice.roughnessBias,
      screenLight: this.screenLight,
      ...overrides,
    };
  }

  _caveShape() {
    return {
      frontZ: ice.caveFrontZ,
      length: ice.caveLength,
      width: ice.caveWidth,
      height: ice.caveHeight,
      taper: ice.caveTaper,
      bend: ice.caveBend,
    };
  }

  init() {
    const groundGeometry = new THREE.PlaneGeometry(500, 500);
    this.ground = new IceGround(
      groundGeometry,
      this._materialOptions({
        uvScale: ice.uvScale,
        parallaxScale: ice.parallaxScale,
        colorIntensity: ice.colorIntensity,
        reflectionStrength: ice.reflectionStrength,
        normalScale: ice.normalScale,
      }),
    );

    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = GROUND_Y;
    this.scene.add(this.ground);

    this.rig = new THREE.Group();
    this.rig.name = "IceRig";
    this.rig.position.z = ice.sceneZ;
    this.scene.add(this.rig);

    this.cave = new IceCave(
      this._materialOptions({
        uvScale: ice.caveUvScale,
        parallaxScale: ice.caveParallaxScale,
        colorIntensity: ice.caveColorIntensity,
        normalScale: ice.caveNormalScale,
      }),
      GROUND_Y,
      this._caveShape(),
    );
    this.rig.add(this.cave);

    this.backlight = new THREE.PointLight(
      ice.backlightColor,
      ice.backlightIntensity,
      ice.backlightDistance,
      2,
    );
    this.backlight.position.fromArray(ice.backlightPos);
    this.rig.add(this.backlight);

    this.rim = new THREE.PointLight(
      ice.rimColor,
      ice.rimIntensity,
      ice.rimDistance,
      2,
    );
    this.rim.position.fromArray(ice.rimPos);
    this.rig.add(this.rim);

    this.ambientLight = new THREE.AmbientLight(
      ice.ambientColor,
      ice.ambientIntensity,
    );
    this.scene.add(this.ambientLight);
    this.scene.environmentIntensity = ice.environmentIntensity;
  }

  _buildFog() {
    this.volumetricFog = createVolumetricFog({
      noiseTexture: this.fogNoiseTexture,
      screenLight: this.screenLight,
      fogMinY: GROUND_Y,
      fogDensity: ice.fogDensity,
      heightFactor: ice.fogHeightFalloff,
      steps: this._fogSteps,
      fogColor: new THREE.Color(ice.fogColor),
      fogColor2: new THREE.Color(ice.fogColor2),
      fogAlpha: ice.fogAlpha,
      fogSpeed: ice.fogSpeed,
      frequency: ice.fogFrequency,
      maxDistance: ice.fogMaxDistance,
    });
    this.scenePostprocessingChain = [this.volumetricFog];
  }

  _setupEnvironment() {
    if (this._envInitialized || !store.gl) return;
    this._envInitialized = true;

    const envScene = createOvercastEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(store.gl);
    this._environmentTarget = pmremGenerator.fromScene(envScene);
    this.scene.environment = this._environmentTarget.texture;
    pmremGenerator.dispose();

    envScene.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
  }

  _rebuildCave() {
    this.cave?.rebuild(this._caveShape());
  }

  attachDebug(gui, { sceneManager } = {}) {
    if (!gui) return;
    const folder = getDebugFolder(gui, "IceScene");
    if (folder._debugBound) return;
    folder._debugBound = true;

    const camera = sceneManager?.cameraController?.camera;
    const fog = this.volumetricFog?.uniforms;
    const ground = this.ground;
    const cave = this.cave?.controls;

    bindParamGroup(
      gui,
      params.IceScene,
      (key) => {
        if (key === "fov") {
          return {
            object: this.cameraState,
            property: "fov",
            onChange: (v) => {
              if (!camera) return;
              camera.fov = v;
              camera.updateProjectionMatrix();
            },
          };
        }
        if (key === "position") {
          return {
            object: this.cameraState,
            property: "position",
            onChange: () => camera?.position.copy(this.cameraState.position),
          };
        }
        if (key === "lookAt") {
          return {
            object: this.cameraState,
            property: "lookAt",
            onChange: () => camera?.lookAt(this.cameraState.lookAt),
          };
        }

        if (key === "sceneZ") {
          return { object: this.rig.position, property: "z" };
        }
        if (key === "background") {
          return { object: this.scene, property: "background" };
        }
        if (key === "environmentIntensity") {
          return { object: this.scene, property: "environmentIntensity" };
        }
        if (key === "ambientColor") {
          return { object: this.ambientLight, property: "color" };
        }
        if (key === "ambientIntensity") {
          return { object: this.ambientLight, property: "intensity" };
        }

        if (key === "caveFrontZ") {
          return {
            object: ice,
            property: "caveFrontZ",
            onChange: (v) => {
              ice.caveFrontZ = v;
              this._rebuildCave();
            },
          };
        }
        if (key === "caveLength") {
          return {
            object: ice,
            property: "caveLength",
            onChange: (v) => {
              ice.caveLength = v;
              this._rebuildCave();
            },
          };
        }
        if (key === "caveWidth") {
          return {
            object: ice,
            property: "caveWidth",
            onChange: (v) => {
              ice.caveWidth = v;
              this._rebuildCave();
            },
          };
        }
        if (key === "caveHeight") {
          return {
            object: ice,
            property: "caveHeight",
            onChange: (v) => {
              ice.caveHeight = v;
              this._rebuildCave();
            },
          };
        }
        if (key === "caveTaper") {
          return {
            object: ice,
            property: "caveTaper",
            onChange: (v) => {
              ice.caveTaper = v;
              this._rebuildCave();
            },
          };
        }
        if (key === "caveBend") {
          return {
            object: ice,
            property: "caveBend",
            onChange: (v) => {
              ice.caveBend = v;
              this._rebuildCave();
            },
          };
        }
        if (key === "caveUvScale") return { uniform: cave?.uvScale };
        if (key === "caveParallaxScale") return { uniform: cave?.parallaxScale };
        if (key === "caveColorIntensity") return { uniform: cave?.colorIntensity };
        if (key === "caveNormalScale") return { uniform: cave?.normalScale };

        if (key === "uvScale") return { uniform: ground?.uvScale };
        if (key === "parallaxScale") return { uniform: ground?.parallaxScale };
        if (key === "colorIntensity") return { uniform: ground?.colorIntensity };
        if (key === "reflectionStrength") {
          return { uniform: ground?.reflectionStrength };
        }
        if (key === "normalScale") return { uniform: ground?.normalScale };

        if (key === "tint") {
          return {
            uniform: ground?.tint,
            onChange: () => {
              if (ground?.tint && cave?.tint) cave.tint.value.copy(ground.tint.value);
            },
          };
        }
        if (key === "roughnessScale") {
          return {
            uniform: ground?.roughnessScale,
            onChange: (v) => {
              if (cave?.roughnessScale) cave.roughnessScale.value = v;
            },
          };
        }
        if (key === "roughnessBias") {
          return {
            uniform: ground?.roughnessBias,
            onChange: (v) => {
              if (cave?.roughnessBias) cave.roughnessBias.value = v;
            },
          };
        }

        if (key === "fogColor") return { uniform: fog?.fogColor };
        if (key === "fogColor2") return { uniform: fog?.fogColor2 };
        if (key === "fogDensity") return { uniform: fog?.fogDensity };
        if (key === "fogAlpha") return { uniform: fog?.fogAlpha };
        if (key === "fogHeightFalloff") return { uniform: fog?.heightFactor };
        if (key === "fogSpeed") return { uniform: fog?.fogSpeed };
        if (key === "fogFrequency") return { uniform: fog?.frequency };
        if (key === "fogMaxDistance") return { uniform: fog?.maxDistance };
        if (key === "fogSteps") {
          return { object: this, property: "_fogSteps" };
        }

        if (key === "backlightColor") {
          return { object: this.backlight, property: "color" };
        }
        if (key === "backlightIntensity") {
          return { object: this.backlight, property: "intensity" };
        }
        if (key === "backlightDistance") {
          return { object: this.backlight, property: "distance" };
        }
        if (key === "backlightPos") {
          return { object: this.backlight, property: "position" };
        }
        if (key === "rimColor") return { object: this.rim, property: "color" };
        if (key === "rimIntensity") {
          return { object: this.rim, property: "intensity" };
        }
        if (key === "rimDistance") return { object: this.rim, property: "distance" };
        if (key === "rimPos") return { object: this.rim, property: "position" };

        return null;
      },
      "IceScene",
    );
  }

  update() {
    this._setupEnvironment();
  }

  setPersistentScene(renderer, persistentScene, camera, viewport, screenScene) {
    if (!this.ground) return;
    this._setupEnvironment();

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
        this.scene,
      );
      this._externalSceneInitialized = true;
    }

    const { width, height, devicePixelRatio } = viewport;
    this.ground.resizeReflection(
      Math.max(1, Math.round(width * devicePixelRatio * 0.5)),
      Math.max(1, Math.round(height * devicePixelRatio * 0.5)),
    );
    this.ground.renderExternalReflection(camera);
  }

  dispose() {
    this.cave?.dispose();
    this.fogNoiseTexture?.dispose();
    this._environmentTarget?.dispose();
    if (this.ground) {
      this.ground.dispose();
      this.ground = null;
    }
  }
}
