import { Color, Mesh, Vector3, Vector4, Matrix4, MeshStandardNodeMaterial,
  DataTexture, RGBAFormat, HalfFloatType, PerspectiveCamera, RepeatWrapping,
  NoColorSpace } from 'three/webgpu';
import { cameraPosition, cameraViewMatrix, positionWorld, time, texture, vec2,
  vec3, dot, float, uniform, mix, screenUV, smoothstep, sin, cos, exp } from 'three/tsl';
import { createRenderTarget } from '../../utils/renderTarget.js';

const _cameraWorldPosition = new Vector3();
const _reflectorWorldPosition = new Vector3();
const _rotationMatrix = new Matrix4();
const _lookAtPosition = new Vector3();
const _view = new Vector3();
const _target = new Vector3();
const _waterNormal = new Vector3(0, 1, 0);
const _tempVec = new Vector3();

/** Screen-lit water with one shared planar reflection and geometry-driven shores. */
export class WaterWithReflection extends Mesh {
  constructor(geometry, options) {
    const material = new MeshStandardNodeMaterial();
    super(geometry, material);
    const p = options.settings;
    this.controls = {};
    for (const key of ['waveScale', 'waveSpeed', 'waveStrength', 'waterRoughness',
      'reflectionStrength', 'reflectionDistortion', 'shoreWidth', 'shoreStrength',
      'shoreFrequency', 'shoreSpeed', 'waterLightStrength']) this.controls[key] = uniform(p[key]);
    this.controls.waterColor = uniform(new Color(p.waterColor));
    this.controls.foamColor = uniform(new Color(p.foamColor));
    const c = this.controls;
    this.wallBounds = uniform(new Vector4(p.wallX, p.wallZ, p.wallWidth, p.wallDepth));
    // Keep normal data linear, including ImageBitmap textures in the worker.
    this._normals = options.waterNormals?.clone() ?? new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    this._normals.colorSpace = NoColorSpace;
    this._normals.wrapS = this._normals.wrapT = RepeatWrapping;
    this._normals.needsUpdate = true;
    this._dummy = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat);
    this._dummy.needsUpdate = true;
    this.reflectionTexture = texture(this._dummy);
    this._virtualCamera = new PerspectiveCamera();
    this.reflectionInterval = p.reflectionInterval;
    this._frame = 0;

    const uv = positionWorld.xz.mul(c.waveScale);
    const drift = time.mul(c.waveSpeed);
    const normals = texture(this._normals);
    const noise = normals.sample(uv.add(vec2(drift, drift.mul(0.7)))).xy
      .add(normals.sample(uv.mul(1.83).sub(vec2(drift.mul(0.6), drift))).xy).sub(1);
    const wallU = positionWorld.x.sub(this.wallBounds.x).div(this.wallBounds.z).add(0.5);
    const profile = texture(options.shoreProfile, vec2(wallU.clamp(), 0.5)).r.sub(0.5);
    const distance = positionWorld.z.sub(this.wallBounds.y.add(profile.mul(this.wallBounds.w)));
    const edge = smoothstep(0, 0.02, wallU).mul(smoothstep(0, 0.02, wallU.oneMinus()));
    const envelope = exp(distance.max(0).div(c.shoreWidth).negate())
      .mul(smoothstep(-0.15, 0.12, distance)).mul(edge);
    const irregularity = sin(positionWorld.x.mul(0.9).add(time.mul(0.13))).mul(0.14)
      .add(noise.x.mul(0.25));
    const phase = distance.add(irregularity).mul(c.shoreFrequency).sub(time.mul(c.shoreSpeed));
    const rings = sin(phase).mul(0.5).add(0.5).pow(10);
    const contact = exp(distance.add(irregularity).abs().mul(-7));
    const foam = rings.mul(0.22).add(contact.mul(0.65)).mul(envelope).mul(c.shoreStrength).clamp();
    const slope = cos(phase).mul(envelope).mul(c.shoreStrength).mul(0.06);
    const normal = vec3(noise.x.mul(c.waveStrength), 1, noise.y.mul(c.waveStrength).add(slope)).normalize();
    material.normalNode = normal.transformDirection(cameraViewMatrix);
    material.colorNode = mix(c.waterColor, c.foamColor, foam);
    material.roughnessNode = mix(c.waterRoughness, float(0.75), foam);
    const facing = dot(cameraPosition.sub(positionWorld).normalize(), normal).clamp();
    const fresnel = facing.oneMinus().pow(5).mul(0.94).add(0.06);
    const reflectionUV = vec2(float(1).sub(screenUV.x), screenUV.y)
      .add(normal.xz.mul(c.reflectionDistortion));
    const pad = reflectionUV.min(float(1).sub(reflectionUV));
    const fade = smoothstep(0, 0.025, pad.x.min(pad.y));
    material.emissiveNode = this.reflectionTexture.sample(reflectionUV.clamp()).rgb
      .mul(fresnel).mul(c.reflectionStrength).mul(fade).mul(foam.oneMinus());
    for (const side of ['front', 'back']) options.screenLight?.applyTo(material, {
      baseColor: material.colorNode, roughness: material.roughnessNode,
      normalNode: normal, side, intensityScale: c.waterLightStrength,
    });
  }

  setExternalScenes(renderer, externalScene, screenScene, width, height, meadowScene, wall) {
    this._renderer = renderer;
    this._externalScene = externalScene;
    this._screenScene = screenScene;
    this._meadowScene = meadowScene;
    this._wall = wall;
    if (!this._reflectionTarget) {
      this._reflectionTarget = createRenderTarget(width, height, { type: HalfFloatType, samples: 0 });
      this.reflectionTexture.value = this._reflectionTarget.texture;
    } else if (this._reflectionTarget.width !== width || this._reflectionTarget.height !== height) {
      this._reflectionTarget.setSize(width, height);
      this._frame = 0;
    }
  }

  _updateReflectionCamera(camera) {
    this.getWorldPosition(_tempVec);
    _reflectorWorldPosition.set(0, _tempVec.y, 0);
    _cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
    _view.subVectors(_reflectorWorldPosition, _cameraWorldPosition);
    _view.reflect(_waterNormal).negate().add(_reflectorWorldPosition);
    _rotationMatrix.extractRotation(camera.matrixWorld);
    _lookAtPosition.set(0, 0, -1).applyMatrix4(_rotationMatrix).add(_cameraWorldPosition);
    _target.subVectors(_reflectorWorldPosition, _lookAtPosition);
    _target.reflect(_waterNormal).negate().add(_reflectorWorldPosition);
    this._virtualCamera.position.copy(_view);
    this._virtualCamera.up.set(0, 1, 0).applyMatrix4(_rotationMatrix).reflect(_waterNormal);
    this._virtualCamera.lookAt(_target);
    this._virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
    this._virtualCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    this._virtualCamera.coordinateSystem = camera.coordinateSystem;
    this._virtualCamera.near = camera.near;
    this._virtualCamera.far = camera.far;
    this._virtualCamera.updateMatrixWorld();
  }

  renderExternalReflection(camera) {
    if (!this._reflectionTarget || this._frame++ % this.reflectionInterval !== 0) return;
    this._updateReflectionCamera(camera);
    const renderer = this._renderer;
    const target = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const color = renderer.getClearColor(new Color());
    const alpha = renderer.getClearAlpha();
    const visible = this.visible;
    this.visible = false;
    this._wall.controls.reflectionPass.value = 1;
    try {
      renderer.setRenderTarget(this._reflectionTarget);
      renderer.autoClear = true;
      renderer.setClearColor(0x000000, 1);
      renderer.render(this._meadowScene, this._virtualCamera);
      renderer.autoClear = false;
      if (this._screenScene) renderer.render(this._screenScene, this._virtualCamera);
      if (this._externalScene) renderer.render(this._externalScene, this._virtualCamera);
    } finally {
      this.visible = visible;
      this._wall.controls.reflectionPass.value = 0;
      renderer.setRenderTarget(target);
      renderer.setClearColor(color, alpha);
      renderer.autoClear = autoClear;
    }
  }

  dispose() {
    this._reflectionTarget?.dispose();
    this._normals.dispose();
    this._dummy.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
