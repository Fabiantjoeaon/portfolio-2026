import BaseScene from "../BaseScene.js";
import {
  Scene,
  Vector3,
  Color,
  PlaneGeometry,
  AmbientLight,
} from "three/webgpu";
import { WaterWithReflection } from "./WaterWithReflection.js";
import { PlantWall } from "./PlantWall.js";
import { MeadowRain } from "./MeadowRain.js";
import { RoseTrail } from "./RoseTrail.js";
import { createVolumetricFog } from "../../postprocessing/volumetricFog.js";
import { createNoiseTexture2D } from "../../utils/NoiseTexture3D.js";
import loader from "@/offscreen/loader";
import { params, paramValues } from "@/offscreen/params";
import {
  bindParamGroup,
  getDebugFolder,
} from "@/offscreen/debug/bindDebugParams";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";

export default class MeadowScene extends BaseScene {
  static resources = [
    {
      name: "meadowWall",
      url: resolvePublicPath("assets/models/meadow/plant-wall.glb"),
      fileSize: 4482196,
    },
    {
      name: "meadowRoseMesh",
      url: resolvePublicPath("assets/scenes/meadow/flowers/GNRoseV4_vat/GNRoseV4-runtime.glb"),
      fileSize: 175000,
    },
    {
      name: "meadowRoseVat",
      url: resolvePublicPath("assets/scenes/meadow/flowers/GNRoseV4_vat/GNRoseV4_vat.exr"),
      fileSize: 3200000,
    },
    {
      name: "meadowRoseColor",
      url: resolvePublicPath("assets/scenes/meadow/flowers/GNRoseV4_vat/FlowerUV.png"),
      fileSize: 204,
    },
    {
      name: "meadowRoseRemap",
      url: resolvePublicPath("assets/scenes/meadow/flowers/GNRoseV4_vat/GNRoseV4-remap_info.json"),
      fileSize: 222,
    },
  ];

  constructor(config = {}) {
    super(config);
    this.name = config.name || "MeadowScene";
    this.settings = { ...paramValues(params.MeadowScene), ...config.settings };
    const p = this.settings;
    this.scene = new Scene();
    this.scene.background = new Color(p.background);
    this.cameraState = {
      position: new Vector3().fromArray(p.position),
      lookAt: new Vector3().fromArray(p.lookAt),
      fov: p.fov,
      hoverPos: new Vector3(2, 2, 0),
      hoverRate: 0.03,
    };
    const asset = loader.resources.meadowWall?.asset;
    if (!asset)
      throw new Error("MeadowScene requires the meadowWall GLB resource.");
    this.rain = new MeadowRain(p);
    this.wall = new PlantWall(asset, this.screenLight, p, this.rain);
    this.scene.add(this.wall);
    this.scene.add(this.rain.mesh);
    this.roseTrail = new RoseTrail({
      asset: loader.resources.meadowRoseMesh.asset,
      vatTexture: loader.resources.meadowRoseVat.asset,
      colorTexture: loader.resources.meadowRoseColor.asset,
      remapInfo: loader.resources.meadowRoseRemap.asset,
      settings: p,
      screenLight: this.screenLight,
    });
    this.water = new WaterWithReflection(new PlaneGeometry(1, 1), {
      settings: p,
      waterNormals: loader.resources.waterNormals?.asset,
      shoreProfile: this.wall.profile,
      screenLight: this.screenLight,
      rain: this.rain,
      roseTrail: this.roseTrail,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);
    this.scene.add(this.roseTrail);
    this.ambientLight = new AmbientLight(p.ambientColor, p.ambientIntensity);
    this.scene.add(this.ambientLight);
    this.fogNoiseTexture = createNoiseTexture2D(128, 4);
    this.volumetricFog = createVolumetricFog({
      noiseTexture: this.fogNoiseTexture,
      screenLight: this.screenLight,
      fogColor: new Color(p.fogColor),
      fogColor2: new Color(p.fogColor2),
      fogDensity: p.fogDensity,
      fogAlpha: p.fogAlpha,
      fogSpeed: p.fogSpeed,
      holeyness: p.fogHoleyness,
      frequency: p.fogFrequency,
      heightFactor: p.fogHeightFalloff,
      fogMinY: p.waterY,
      billowHeight: p.fogBillowHeight,
      ambientStrength: p.fogAmbientStrength,
      lightStrength: p.fogLightStrength,
      maxDistance: p.fogMaxDistance,
      steps: p.fogSteps,
    });
    this.scenePostprocessingChain = [this.volumetricFog];
    this._syncLayout();
  }

  _syncLayout() {
    const p = this.settings;
    this.wall.configure(p);
    this.water.position.y = p.waterY;
    this.water.scale.set(p.waterSize, p.waterSize, 1);
    this.water.wallBounds.value.set(p.wallX, p.wallZ, p.wallWidth, p.wallDepth);
    this.water._frame = 0;
    this.rain.configure(p);
    this.roseTrail.configure(p);
    this.volumetricFog.uniforms.fogMinY.value = p.waterY;
  }

  setPersistentScene(renderer, persistentScene, camera, viewport, screenScene) {
    this.roseTrail.setCamera(camera);
    const { width, height, devicePixelRatio } = viewport;
    const scale = devicePixelRatio * this.settings.reflectionResolution;
    this.water.setExternalScenes(
      renderer,
      persistentScene,
      screenScene,
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
      this.scene,
      this.wall,
    );
    this.water.renderExternalReflection(camera);
  }

  attachDebug(gui, { sceneManager } = {}) {
    if (!gui) return;
    const folder = getDebugFolder(gui, "MeadowScene");
    if (folder._debugBound) return;
    folder._debugBound = true;
    bindParamGroup(
      gui,
      params.MeadowScene,
      (key) => {
        if (["position", "lookAt", "fov"].includes(key))
          return {
            object: this.cameraState,
            property: key,
            onChange: () => {
              if (
                sceneManager?.scenes.get(sceneManager.activePrevId)
                  ?.sceneObj === this
              )
                sceneManager.cameraController.snapToState(this.cameraState);
            },
          };
        if (key === "background")
          return { object: this.scene, property: "background" };
        if (key === "ambientColor")
          return { object: this.ambientLight, property: "color" };
        if (key === "ambientIntensity")
          return { object: this.ambientLight, property: "intensity" };
        if (this.rain.controls[key])
          return {
            uniform: this.rain.controls[key],
            onChange: () => this.rain.configure(this.settings),
          };
        if (this.roseTrail.controls[key])
          return { uniform: this.roseTrail.controls[key] };
        const fogKey =
          {
            fogFrequency: "frequency",
            fogHeightFalloff: "heightFactor",
            fogBillowHeight: "billowHeight",
            fogAmbientStrength: "ambientStrength",
            fogLightStrength: "lightStrength",
            fogMaxDistance: "maxDistance",
            fogSteps: "steps",
            fogHoleyness: "holeyness",
          }[key] ?? key;
        if (this.volumetricFog.uniforms[fogKey])
          return { uniform: this.volumetricFog.uniforms[fogKey] };
        if (this.wall.controls[key])
          return { uniform: this.wall.controls[key] };
        if (this.water.controls[key])
          return { uniform: this.water.controls[key] };
        if (key === "reflectionInterval")
          return { object: this.water, property: key };
        if (key === "reflectionResolution")
          return { object: this.settings, property: key };
        return {
          object: this.settings,
          property: key,
          onChange: () => this._syncLayout(),
        };
      },
      "MeadowScene",
    );
    for (const name of Object.keys(params.MeadowScene))
      getDebugFolder(gui, `MeadowScene/${name}`).close();
  }

  update(timeMs) {
    this.rain.update(timeMs);
    this.roseTrail.update(timeMs);
  }

  dispose() {
    this.rain.dispose();
    this.roseTrail.dispose();
    this.fogNoiseTexture.dispose();
    this.scenePostprocessingChain = null;
    this.wall.dispose();
    this.water.dispose();
    this.scene.clear();
  }
}
