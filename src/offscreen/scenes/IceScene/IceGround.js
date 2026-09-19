import {
  Mesh,
  Vector3,
  Matrix4,
  MeshStandardNodeMaterial,
  DataTexture,
  RGBAFormat,
  HalfFloatType,
  PerspectiveCamera,
  RepeatWrapping,
  SRGBColorSpace,
} from "three/webgpu";

import {
  Fn,
  uv,
  texture,
  parallaxUV,
  blendOverlay,
  normalMap,
  positionWorld,
  cameraPosition,
  normalize,
  normalWorld,
  dot,
  pow,
  max,
  mix,
  clamp,
  float,
  vec2,
  uniform,
  screenUV,
} from "three/tsl";
import { createRenderTarget } from "../../utils/renderTarget.js";

// Reflection helpers (same approach as WaterWithReflection / ReflectorNode)
const _cameraWorldPosition = new Vector3();
const _reflectorWorldPosition = new Vector3();
const _rotationMatrix = new Matrix4();
const _lookAtPosition = new Vector3(0, 0, -1);
const _view = new Vector3();
const _target = new Vector3();
const _groundNormal = new Vector3(0, 1, 0);
const _tempVec = new Vector3();

/**
 * IceGround - a parallax UV ice floor, following the official three.js
 * webgpu_parallax_uv example: the displacement map parallax-shifts the UVs
 * of a second ice texture "frozen" below the surface, overlay-blended with
 * the top crack layer. The persistent scene (grid) is rendered from a
 * mirrored camera into a render target and blended in as a reflection.
 */
export class IceGround extends Mesh {
  /**
   * @param {THREE.BufferGeometry} geometry - Ground plane geometry
   * @param {Object} options - { iceColor, iceBottom, iceRoughness, iceDisplacement, iceNormal } textures
   */
  constructor(geometry, options = {}) {
    // parallaxUV works in tangent space
    geometry.computeTangents();

    const material = new MeshStandardNodeMaterial();
    material.name = "IceGroundMaterial";
    material.metalness = 0;

    super(geometry, material);

    this._renderer = null;
    this._externalScene = null;
    this._screenScene = null;
    this._reflectionTarget = null;
    this._virtualCamera = new PerspectiveCamera();

    const fallback = (data) => {
      const tex = new DataTexture(new Uint8Array(data), 1, 1, RGBAFormat);
      tex.needsUpdate = true;
      return tex;
    };

    const topTex = options.iceColor ?? fallback([160, 190, 210, 255]);
    const bottomTex = options.iceBottom ?? fallback([60, 90, 120, 255]);
    const roughTex = options.iceRoughness ?? fallback([80, 80, 80, 255]);
    const dispTex = options.iceDisplacement ?? fallback([128, 128, 128, 255]);
    const normalTex = options.iceNormal ?? fallback([128, 128, 255, 255]);

    for (const tex of [topTex, bottomTex, roughTex, dispTex, normalTex]) {
      tex.wrapS = tex.wrapT = RepeatWrapping;
    }
    topTex.colorSpace = SRGBColorSpace;
    bottomTex.colorSpace = SRGBColorSpace;

    // Tweakables (example defaults: uvScale 3, parallaxScale 0.2–0.5, color ×5)
    this.uvScale = uniform(options.uvScale ?? 3.0);
    this.parallaxScale = uniform(options.parallaxScale ?? 0.35);
    this.colorIntensity = uniform(options.colorIntensity ?? 3.0);
    this.reflectionStrength = uniform(0.0);
    this._reflectionStrengthValue = options.reflectionStrength ?? 0.55;

    // External reflection texture (mirrored render of the grid)
    this._dummyTexture = fallback([0, 0, 0, 0]);
    this.externalTextureNode = texture(this._dummyTexture);

    const scaledUV = uv().mul(this.uvScale);
    const iceDispNode = texture(dispTex, scaledUV);

    material.colorNode = Fn(() => {
      // Parallax: the displacement map pushes the bottom layer's UVs along
      // the view direction so it reads as frozen depth below the surface
      const offsetUV = iceDispNode.mul(this.parallaxScale);
      const parallaxResult = texture(bottomTex, parallaxUV(scaledUV, offsetUV));
      const ice = blendOverlay(texture(topTex, scaledUV), parallaxResult).mul(
        this.colorIntensity
      );

      // Mirrored external reflection (grid + screen), fresnel weighted.
      // The reflection target is rendered from a mirrored camera, so sample
      // with x-flipped screen UV like the reflector node does.
      const eyeDir = normalize(cameraPosition.sub(positionWorld));
      const facing = max(dot(eyeDir, normalWorld), 0.0);
      // Low base reflectance: looking down, the parallax depth must stay
      // visible; the grid still reflects clearly at grazing angles
      const rf0 = float(0.12);
      const fresnel = pow(float(1.0).sub(facing), 3.0)
        .mul(float(1.0).sub(rf0))
        .add(rf0);

      // Slight icy distortion of the reflection from the crack depth
      const distort = vec2(iceDispNode.r.sub(0.5).mul(0.03));
      const externalUV = vec2(
        float(1.0).sub(screenUV.x).add(distort.x),
        screenUV.y.add(distort.y)
      );
      const reflection = this.externalTextureNode.sample(externalUV);

      // Clamped so a strong reflectionStrength brightens the reflection
      // without fully replacing the ice underneath (which flattens it)
      const reflAmount = clamp(
        fresnel.mul(this.reflectionStrength),
        0.0,
        0.85
      );
      return mix(ice.rgb, reflection.rgb.add(ice.rgb.mul(0.6)), reflAmount);
    })();

    // Smoother than the map says (sharper env reflections) and a boosted
    // normal scale: this is what makes the bump relief actually visible
    this.normalScale = uniform(options.normalScale ?? 2.2);
    material.roughnessNode = texture(roughTex, scaledUV).r.mul(0.55);
    material.normalNode = normalMap(
      texture(normalTex, scaledUV),
      vec2(this.normalScale, this.normalScale)
    );
  }

  /**
   * Wire the external scenes whose mirrored render becomes the reflection
   */
  setExternalScenes(renderer, externalScene, screenScene, width, height) {
    this._renderer = renderer;
    this._externalScene = externalScene;
    this._screenScene = screenScene;

    if (!this._reflectionTarget) {
      this._reflectionTarget = createRenderTarget(width, height, {
        type: HalfFloatType,
      });
    }

    this.reflectionStrength.value = this._reflectionStrengthValue;
  }

  /**
   * Mirror the main camera across the ground plane (ReflectorNode approach)
   */
  _updateReflectionCamera(camera) {
    this.getWorldPosition(_tempVec);
    _reflectorWorldPosition.set(0, _tempVec.y, 0);

    _cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

    _view.subVectors(_reflectorWorldPosition, _cameraWorldPosition);
    _view.reflect(_groundNormal).negate();
    _view.add(_reflectorWorldPosition);

    _rotationMatrix.extractRotation(camera.matrixWorld);
    _lookAtPosition.set(0, 0, -1);
    _lookAtPosition.applyMatrix4(_rotationMatrix);
    _lookAtPosition.add(_cameraWorldPosition);

    _target.subVectors(_reflectorWorldPosition, _lookAtPosition);
    _target.reflect(_groundNormal).negate();
    _target.add(_reflectorWorldPosition);

    this._virtualCamera.position.copy(_view);
    this._virtualCamera.up.set(0, 1, 0);
    this._virtualCamera.up.applyMatrix4(_rotationMatrix);
    this._virtualCamera.up.reflect(_groundNormal);
    this._virtualCamera.lookAt(_target);

    this._virtualCamera.near = 0.01;
    this._virtualCamera.far = camera.far;
    this._virtualCamera.fov = camera.fov;
    this._virtualCamera.aspect = camera.aspect;
    this._virtualCamera.updateProjectionMatrix();
    this._virtualCamera.updateMatrixWorld();
  }

  /**
   * Render the mirrored external scenes into the reflection target.
   * Call once per frame before the main scene render.
   */
  renderExternalReflection(camera) {
    if (!this._renderer || !this._reflectionTarget) return;
    if (!this._externalScene && !this._screenScene) return;

    // Half-rate update: re-rendering the full tile grid every frame is the
    // scene's biggest cost, and the faded reflection can't show a 1-frame lag
    this._reflectionFrame = (this._reflectionFrame ?? 0) + 1;
    if (this._reflectionFrame % 2 === 0) return;

    this._updateReflectionCamera(camera);

    // Mirrored camera flips winding; skip frustum culling to be safe
    const cullingStates = [];
    const disableCulling = (scene) => {
      if (!scene) return;
      scene.traverse((obj) => {
        if (obj.isMesh || obj.isLine || obj.isPoints) {
          cullingStates.push({ obj, frustumCulled: obj.frustumCulled });
          obj.frustumCulled = false;
        }
      });
    };

    disableCulling(this._externalScene);
    disableCulling(this._screenScene);

    const currentRenderTarget = this._renderer.getRenderTarget();
    const currentAutoClear = this._renderer.autoClear;

    this._renderer.setRenderTarget(this._reflectionTarget);
    this._renderer.autoClear = true;
    this._renderer.setClearColor(0x000000, 0);
    this._renderer.clear();

    if (this._screenScene) {
      this._renderer.render(this._screenScene, this._virtualCamera);
    }

    if (this._externalScene) {
      this._renderer.autoClear = false;
      this._renderer.render(this._externalScene, this._virtualCamera);
    }

    this._renderer.setRenderTarget(currentRenderTarget);
    this._renderer.autoClear = currentAutoClear;

    for (const state of cullingStates) {
      state.obj.frustumCulled = state.frustumCulled;
    }

    this.externalTextureNode.value = this._reflectionTarget.texture;
  }

  resizeReflection(width, height) {
    if (this._reflectionTarget) {
      this._reflectionTarget.setSize(width, height);
    }
  }

  dispose() {
    if (this._reflectionTarget) {
      this._reflectionTarget.dispose();
      this._reflectionTarget = null;
    }

    this._dummyTexture.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
