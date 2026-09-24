import BaseScene from '../BaseScene.js';
import { Scene, Vector3, Color, PlaneGeometry, AmbientLight } from 'three/webgpu';
import { WaterWithReflection } from './WaterWithReflection.js';
import { PlantWall } from './PlantWall.js';
import loader from '@/offscreen/loader';
import { params, paramValues } from '@/offscreen/params';
import { bindParamGroup, getDebugFolder } from '@/offscreen/debug/bindDebugParams';
import { resolvePublicPath } from '@/offscreen/utils/publicPath';

export default class MeadowScene extends BaseScene {
  static resources = [{
    name: 'meadowWall',
    url: resolvePublicPath('assets/models/meadow/plant-wall.glb'),
    fileSize: 4120940,
  }];

  constructor(config = {}) {
    super(config);
    this.name = config.name || 'MeadowScene';
    this.settings = { ...paramValues(params.MeadowScene), ...config.settings };
    const p = this.settings;
    this.scene = new Scene();
    this.scene.background = new Color(p.background);
    this.cameraState = {
      position: new Vector3().fromArray(p.position),
      lookAt: new Vector3().fromArray(p.lookAt), fov: p.fov,
      hoverPos: new Vector3(1, 1, 0), hoverRate: 0.03,
    };
    const asset = loader.resources.meadowWall?.asset;
    if (!asset) throw new Error('MeadowScene requires the meadowWall GLB resource.');
    this.wall = new PlantWall(asset, this.screenLight, p);
    this.scene.add(this.wall);
    this.water = new WaterWithReflection(new PlaneGeometry(1, 1), {
      settings: p, waterNormals: loader.resources.waterNormals?.asset,
      shoreProfile: this.wall.profile, screenLight: this.screenLight,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);
    this.ambientLight = new AmbientLight(p.ambientColor, p.ambientIntensity);
    this.scene.add(this.ambientLight);
    this._syncLayout();
  }

  _syncLayout() {
    const p = this.settings;
    this.wall.configure(p);
    this.water.position.y = p.waterY;
    this.water.scale.set(p.waterSize, p.waterSize, 1);
    this.water.wallBounds.value.set(p.wallX, p.wallZ, p.wallWidth, p.wallDepth);
    this.water._frame = 0;
  }

  setPersistentScene(renderer, persistentScene, camera, viewport, screenScene) {
    const { width, height, devicePixelRatio } = viewport;
    const scale = devicePixelRatio * this.settings.reflectionResolution;
    this.water.setExternalScenes(renderer, persistentScene, screenScene,
      Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)),
      this.scene, this.wall);
    this.water.renderExternalReflection(camera);
  }

  attachDebug(gui, { sceneManager } = {}) {
    if (!gui) return;
    const folder = getDebugFolder(gui, 'MeadowScene');
    if (folder._debugBound) return;
    folder._debugBound = true;
    bindParamGroup(gui, params.MeadowScene, key => {
      if (['position', 'lookAt', 'fov'].includes(key)) return {
        object: this.cameraState, property: key, onChange: () => {
          if (sceneManager?.scenes.get(sceneManager.activePrevId)?.sceneObj === this)
            sceneManager.cameraController.snapToState(this.cameraState);
        },
      };
      if (key === 'background') return { object: this.scene, property: 'background' };
      if (key === 'ambientColor') return { object: this.ambientLight, property: 'color' };
      if (key === 'ambientIntensity') return { object: this.ambientLight, property: 'intensity' };
      if (this.wall.controls[key]) return { uniform: this.wall.controls[key] };
      if (this.water.controls[key]) return { uniform: this.water.controls[key] };
      if (key === 'reflectionInterval') return { object: this.water, property: key };
      if (key === 'reflectionResolution') return { object: this.settings, property: key };
      return { object: this.settings, property: key, onChange: () => this._syncLayout() };
    }, 'MeadowScene');
    for (const name of Object.keys(params.MeadowScene)) getDebugFolder(gui, `MeadowScene/${name}`).close();
  }

  dispose() {
    this.wall.dispose();
    this.water.dispose();
    this.scene.clear();
  }
}
