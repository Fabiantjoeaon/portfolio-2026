import { ENABLE_ROSE_TRAIL } from "@/shared/flags";
import { mobileSettings, bindMobileCamera } from "@/shared/mobileSettings";
import { cameraFov, cameraLookAt, cameraPosition } from "@/shared/cameraFraming";
import { getFlag } from "@/offscreen/lib/query";
import { store } from "@/offscreen/store";
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
import { MeadowTracking } from "./MeadowTracking.js";
import { createVolumetricFog } from "../../postprocessing/volumetricFog.js";
import { createNoiseTexture2D } from "../../utils/NoiseTexture3D.js";
import loader from "@/offscreen/loader";
import { params, paramValues } from "@/offscreen/params";
import {
  bindParamGroup,
  getDebugFolder,
} from "@/offscreen/debug/bindDebugParams";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";
import { ScreenDepthMask } from "../../utils/ScreenDepthMask.js";

const WORLD_UP = new Vector3(0, 1, 0);
// PlantWall's opaque backing plane, in wall-local depth units.
const BACKING_Z = 0.38;

const ROSE_RESOURCES = [
  {
    name: "meadowRoseMesh",
    url: resolvePublicPath(
      "assets/scenes/meadow/flowers/GNRoseV4_vat/GNRoseV4-runtime.glb",
    ),
    fileSize: 66344,
  },
  {
    name: "meadowRoseVat",
    url: resolvePublicPath(
      "assets/scenes/meadow/flowers/GNRoseV4_vat/GNRoseV4_vat.exr",
    ),
    fileSize: 3200000,
  },
  {
    name: "meadowRoseColor",
    url: resolvePublicPath(
      "assets/scenes/meadow/flowers/GNRoseV4_vat/FlowerUV.png",
    ),
    fileSize: 204,
  },
  {
    name: "meadowRoseRemap",
    url: resolvePublicPath(
      "assets/scenes/meadow/flowers/GNRoseV4_vat/GNRoseV4-remap_info.json",
    ),
    fileSize: 222,
  },
];

export default class MeadowScene extends BaseScene {
  static resources = [
    {
      name: "meadowWall",
      url: resolvePublicPath("assets/models/meadow/plant-wall.glb"),
      fileSize: 9712100,
    },
    ...(ENABLE_ROSE_TRAIL ? ROSE_RESOURCES : []),
  ];

  constructor(config = {}) {
    super(config);
    this.name = config.name || "MeadowScene";
    this.settings = { ...paramValues(params.MeadowScene), ...config.settings };
    const p = this._layoutSettings();
    this.scene = new Scene();
    this.scene.background = new Color(p.background);
    this.cameraState = bindMobileCamera({
      position: new Vector3().fromArray(p.position),
      lookAt: new Vector3().fromArray(p.lookAt),
      fov: p.fov,
      fovPortrait: p.fovPortrait,
      fovLandscape: p.fovLandscape,
      hoverPos: new Vector3(2, 2, 0),
      hoverRate: 0.03,
    }, "meadow");
    const asset = loader.resources.meadowWall?.asset;
    if (!asset)
      throw new Error("MeadowScene requires the meadowWall GLB resource.");
    this.rain = new MeadowRain(p);
    this.wall = new PlantWall(asset, this.screenLight, p, this.rain);
    this.scene.add(this.wall);
    this.scene.add(this.rain.mesh);
    this.roseTrail = ENABLE_ROSE_TRAIL
      ? new RoseTrail({
          asset: loader.resources.meadowRoseMesh.asset,
          vatTexture: loader.resources.meadowRoseVat.asset,
          colorTexture: loader.resources.meadowRoseColor.asset,
          remapInfo: loader.resources.meadowRoseRemap.asset,
          settings: p,
          screenLight: this.screenLight,
        })
      : null;
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
    if (this.roseTrail) this.scene.add(this.roseTrail);
    this.ambientLight = new AmbientLight(p.ambientColor, p.ambientIntensity);
    this.scene.add(this.ambientLight);
    this.fogNoiseTexture = p.fogEnabled ? createNoiseTexture2D(128, 4) : null;
    this.volumetricFog = this.fogNoiseTexture && createVolumetricFog({
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
    this.scenePostprocessingChain = this.volumetricFog ? [this.volumetricFog] : null;
    this.tracking = new MeadowTracking({
      trail: this.roseTrail, wall: this.wall, screenLight: this.screenLight,
      vatTexture: loader.resources.meadowRoseVat?.asset,
      remapInfo: loader.resources.meadowRoseRemap?.asset,
      settings: p,
    });
    this.scene.add(this.tracking.overlay);
    this.ready = this.tracking.ready;
    this._time = 0;
    const viewport = store.viewport;
    this._aspect = viewport?.width ? viewport.width / viewport.height : 0;
    this._syncLayout();
  }

  _layoutSettings() {
    this._mobileFloorDrop = getFlag('touchExperience') ? mobileSettings.floorDrop : 0;
    const p = Object.assign(this.layoutSettings ??= {}, this.settings);
    p.waterY -= this._mobileFloorDrop;
    if (getFlag('touchExperience')) {
      p.roseScaleMin *= mobileSettings.roseScale;
      p.roseScaleMax *= mobileSettings.roseScale;
      p.wallZ = p.mobileWallZ;
      p.wallWidth = p.mobileWallWidth;
      p.wallHeight = p.mobileWallHeight;
    }
    this._fitWall(p);
    return p;
  }

  /**
   * Grows the authored wall until its backing fills the resting camera view
   * (water hides everything below the waterline). Width and height may differ
   * from the authored proportion by at most `wallCoverStretch`; beyond that
   * both grow together, so leaves enlarge instead of distorting.
   */
  _fitWall(p) {
    const state = this.cameraState;
    const aspect = this._aspect;
    if (!state || !aspect) return;
    const touch = getFlag('touchExperience');
    const fit = this._fit ??= {
      eye: new Vector3(), look: new Vector3(), forward: new Vector3(),
      right: new Vector3(), up: new Vector3(), ray: new Vector3(),
    };
    const { eye, look, forward, right, up, ray } = fit;
    cameraPosition(state, touch, eye);
    cameraLookAt(state, touch, look);
    forward.subVectors(look, eye).normalize();
    right.crossVectors(forward, WORLD_UP).normalize();
    up.crossVectors(right, forward);
    const ty = Math.tan(cameraFov(state, aspect, touch) * Math.PI / 360) * p.wallCoverOverscan;
    const tx = ty * aspect;
    const plane = p.wallZ - BACKING_Z * p.wallDepth;
    const base = p.waterY - p.submersion;

    let halfWidth = 0, top = base;
    for (let side = -1; side <= 1; side += 2) {
      let xTop = 0, yTop = 0;
      for (let edge = 1; edge >= -1; edge -= 2) {
        ray.copy(forward).addScaledVector(right, side * tx).addScaledVector(up, edge * ty);
        if (ray.z >= 0) return;
        const t = (plane - eye.z) / ray.z;
        let x = eye.x + ray.x * t;
        const y = eye.y + ray.y * t;
        if (edge > 0) {
          xTop = x; yTop = y;
          top = Math.max(top, y);
        } else if (y < p.waterY && yTop > y) {
          x += (xTop - x) * Math.min(1, (p.waterY - y) / (yTop - y));
        }
        halfWidth = Math.max(halfWidth, Math.abs(x - p.wallX));
      }
    }

    const grow = p.wallCoverStretch;
    const width = Math.max(1, (halfWidth * 2) / p.wallWidth);
    const height = Math.max(1, (top - base) / p.wallHeight);
    p.wallWidth *= Math.max(width, height / grow);
    p.wallHeight *= Math.max(height, width / grow);
  }

  _syncLayout() {
    const p = this._layoutSettings();
    this.wall.configure(p);
    this.water.position.y = p.waterY;
    this.water.scale.set(p.waterSize, p.waterSize, 1);
    this.water.wallBounds.value.set(p.wallX, p.wallZ, p.wallWidth, p.wallDepth);
    this.water._frame = 0;
    this.rain.configure(p);
    this.roseTrail?.configure(p);
    this.tracking.configure(p);
    if (this.volumetricFog) this.volumetricFog.uniforms.fogMinY.value = p.waterY;
  }

  setPersistentScene(renderer, persistentScene, camera, viewport, screenScene) {
    this.volumetricFog?.setPixelRatio(viewport.devicePixelRatio);
    // Reflections use their own camera and must retain the complete garden.
    if (this.screenDepthMask) this.screenDepthMask.visible = false;
    this.roseTrail?.setCamera(camera);
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
    this.tracking.overlay.visible = false;
    try {
      this.water.renderExternalReflection(camera);
    } finally {
      this.tracking.overlay.visible = true;
    }
  }

  setInteractionEnabled(enabled) {
    this.roseTrail?.setInteractionEnabled(enabled);
  }

  renderBeforeScene(renderer, camera, viewport, persistent) {
    const aspect = viewport.width / viewport.height;
    if (aspect !== this._aspect) {
      this._aspect = aspect;
      this._syncLayout();
    }
    this.tracking.update(camera, viewport, this._time, persistent?.grid);
    this.rain.renderEvents(renderer);
    if (persistent) {
      if (!this.screenDepthMask) {
        this.screenDepthMask = new ScreenDepthMask(
          persistent.screenTexture,
          persistent.screenDepth,
          persistent.screenPlane,
        );
        this.scene.add(this.screenDepthMask);
      }
      this.screenDepthMask.update(
        persistent.screenTexture,
        persistent.screenDepth,
        persistent.screenPlane,
      );
    }
    if (this.screenDepthMask) this.screenDepthMask.visible = !!persistent;
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
        const cameraTarget = this._resolveCameraDebugTarget(key, sceneManager);
        if (cameraTarget) return cameraTarget;
        if (["position", "lookAt"].includes(key))
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
        // Save the authored height, never the mobile-adjusted rose uniform.
        if (key === "waterY") return {
          object: this.settings, property: key, onChange: () => this._syncLayout(),
        };
        if (this.rain.controls[key])
          return {
            uniform: this.rain.controls[key],
            onChange: () => this.rain.configure(this.layoutSettings),
          };
        if (this.roseTrail?.controls[key])
          return { uniform: this.roseTrail.controls[key] };
        if (key.startsWith("rose")) {
          const controlKey = key[4].toLowerCase() + key.slice(5);
          if (this.roseTrail?.controls[controlKey])
            return { uniform: this.roseTrail.controls[controlKey] };
        }
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
        if (this.volumetricFog?.uniforms[fogKey])
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
    if (getFlag('touchExperience') && this._mobileFloorDrop !== mobileSettings.floorDrop) {
      this._syncLayout();
    }
    this._time = timeMs * 0.001;
    this.rain.update(timeMs);
    this.roseTrail?.update(timeMs);
  }

  dispose() {
    this.tracking.dispose();
    this.screenDepthMask?.dispose();
    this.rain.dispose();
    this.roseTrail?.dispose();
    this.fogNoiseTexture?.dispose();
    this.scenePostprocessingChain = null;
    this.wall.dispose();
    this.water.dispose();
    this.scene.clear();
  }
}
