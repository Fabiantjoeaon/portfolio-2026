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
    this._shapeSettings = { ...ice };
    this.reflectionResolution = ice.reflectionResolution;

    this.init();

    this.scene.background = new THREE.Color(ice.background);
    this.fogNoiseTexture = createNoiseTexture2D(128, 4);
    this._buildFog();
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
      screenLightScale: ice.screenLightScale,
      screenBackLightScale: ice.screenBackLightScale,
      ...overrides,
    };
  }

  _caveShape() {
    const p = this._shapeSettings;
    return {
      frontZ: p.caveFrontZ, length: p.caveLength,
      width: p.caveWidth, height: p.caveHeight,
      taper: p.caveTaper, bend: p.caveBend,
      ridgeStrength: p.caveRidgeStrength,
      uvRepeatX: p.caveUvRepeatX, uvRepeatY: p.caveUvRepeatY,
      rockCount: p.caveRockCount, rockScale: p.caveRockScale,
      floorY: this.ground?.position.y ?? ice.groundY,
      floorRadius: p.caveFloorRadius,
    };
  }

  init() {
    const groundGeometry = new THREE.PlaneGeometry(ice.groundSize, ice.groundSize);
    this.ground = new IceGround(
      groundGeometry,
      this._materialOptions({
        uvScale: ice.uvScale,
        parallaxScale: ice.parallaxScale,
        colorIntensity: ice.colorIntensity,
        reflectionStrength: ice.reflectionStrength,
        reflectionDistortion: ice.reflectionDistortion,
        reflectionOffsetX: ice.reflectionOffsetX,
        reflectionOffsetY: ice.reflectionOffsetY,
        normalScale: ice.normalScale,
      }),
    );

    this.groundSize = ice.groundSize;
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = ice.groundY;
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
        roughnessScale: ice.caveRoughnessScale,
        roughnessBias: ice.caveRoughnessBias,
        refractionDistortion: ice.caveRefractionDistortion,
        screenReflectionStrength: ice.caveReflectionStrength,
        screenReflectionSpread: ice.caveReflectionSpread,
        screenReflectionBounce: ice.caveReflectionBounce,
        bodyFill: ice.caveBodyFill,
        floorY: ice.groundY,
        floorBlendHeight: ice.caveFloorBlendHeight,
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
      fogMinY: ice.fogBaseY,
      billowHeight: ice.fogBillowHeight,
      lightStrength: ice.fogLightStrength,
      ambientStrength: ice.fogAmbientStrength,
      fogDensity: ice.fogDensity,
      heightFactor: ice.fogHeightFalloff,
      steps: ice.fogSteps,
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
    if (this._envInitialized || !store.gl || this.scene.environmentIntensity <= 0) return;
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

    const controller = sceneManager?.cameraController;
    const syncCamera = () => {
      if (sceneManager?.scenes.get(sceneManager.activePrevId)?.sceneObj !== this) return;
      controller?.snapToState(this.cameraState);
    };
    const fog = this.volumetricFog?.uniforms;
    const ground = this.ground;
    const cave = this.cave?.controls;

    bindParamGroup(
      gui,
      params.IceScene,
      (key) => {
        if (["fov", "position", "lookAt"].includes(key)) {
          return { object: this.cameraState, property: key, onChange: syncCamera };
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

        if ([
          "caveFrontZ", "caveLength", "caveWidth", "caveHeight", "caveTaper",
          "caveBend", "caveRidgeStrength", "caveUvRepeatX", "caveUvRepeatY",
          "caveRockCount", "caveRockScale", "caveFloorRadius",
        ].includes(key)) {
          return { object: this._shapeSettings, property: key, onChange: () => this._rebuildCave() };
        }
        if (key === "groundSize") {
          return { object: this, property: key, onChange: (value) => {
            ground.scale.setScalar(value / ice.groundSize);
          } };
        }
        if (key === "groundY") {
          return { object: ground.position, property: "y", onChange: () => {
            cave.floorY.value = ground.position.y;
            this._rebuildCave();
          } };
        }
        if (key === "reflectionResolution") return { object: this, property: key };
        if (key === "reflectionDistortion") return { uniform: ground.reflectionDistortion };
        if (key === "reflectionOffsetX") {
          return { object: ground, property: "reflectionOffsetX" };
        }
        if (key === "reflectionOffsetY") {
          return { object: ground, property: "reflectionOffsetY" };
        }
        if (key === "screenLightScale" || key === "screenBackLightScale") {
          return { uniform: ground[key], onChange: (value) => { cave[key].value = value; } };
        }
        if (key === "caveUvScale") return { uniform: cave?.uvScale };
        if (key === "caveParallaxScale") return { uniform: cave?.parallaxScale };
        if (key === "caveColorIntensity") return { uniform: cave?.colorIntensity };
        if (key === "caveNormalScale") return { uniform: cave?.normalScale };
        if (key === "caveRoughnessScale") return { uniform: cave?.roughnessScale };
        if (key === "caveRoughnessBias") return { uniform: cave?.roughnessBias };
        if (key === "caveRefractionDistortion") return { uniform: cave?.refractionDistortion };
        if (key === "caveReflectionStrength") return { uniform: cave?.screenReflectionStrength };
        if (key === "caveReflectionSpread") return { uniform: cave?.screenReflectionSpread };
        if (key === "caveReflectionBounce") return { uniform: cave?.screenReflectionBounce };
        if (key === "caveFloorBlendHeight") return { uniform: cave?.floorBlendHeight };
        if (key === "caveBodyFill") return { uniform: cave?.bodyFill };

        if (key === "uvScale") return { uniform: ground?.uvScale };
        if (key === "parallaxScale") return { uniform: ground?.parallaxScale };
        if (key === "colorIntensity") return { uniform: ground?.colorIntensity };
        if (key === "reflectionStrength") {
          return { uniform: ground?.reflectionStrength, onChange: (value) => { ground._reflectionStrengthValue = value; } };
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
          return { uniform: ground?.roughnessScale };
        }
        if (key === "roughnessBias") {
          return { uniform: ground?.roughnessBias };
        }

        const fogKeys = {
          fogBaseY: "fogMinY", fogBillowHeight: "billowHeight",
          fogLightStrength: "lightStrength", fogAmbientStrength: "ambientStrength",
          fogSteps: "steps",
        };
        if (fogKeys[key]) return { uniform: fog[fogKeys[key]] };
        if (key === "fogColor") return { uniform: fog?.fogColor };
        if (key === "fogColor2") return { uniform: fog?.fogColor2 };
        if (key === "fogDensity") return { uniform: fog?.fogDensity };
        if (key === "fogAlpha") return { uniform: fog?.fogAlpha };
        if (key === "fogHeightFalloff") return { uniform: fog?.heightFactor };
        if (key === "fogSpeed") return { uniform: fog?.fogSpeed };
        if (key === "fogFrequency") return { uniform: fog?.frequency };
        if (key === "fogMaxDistance") return { uniform: fog?.maxDistance };

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
    // Keep every group discoverable without scrolling through camera sliders.
    for (const group of Object.keys(params.IceScene)) {
      getDebugFolder(gui, `IceScene/${group}`).close();
    }
  }

  update() {
    this._setupEnvironment();
  }

  setPersistentScene(renderer, persistentScene, camera, viewport, screenScene) {
    if (!this.ground) return;
    this._setupEnvironment();

    if (!this._externalSceneInitialized) {
      const { width, height, devicePixelRatio } = viewport;

      const w = Math.round(width * devicePixelRatio * this.reflectionResolution);
      const h = Math.round(height * devicePixelRatio * this.reflectionResolution);
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
      Math.max(1, Math.round(width * devicePixelRatio * this.reflectionResolution)),
      Math.max(1, Math.round(height * devicePixelRatio * this.reflectionResolution)),
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
