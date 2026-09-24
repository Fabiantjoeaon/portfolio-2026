import { Mesh, Vector3, Matrix4, Color, DataTexture, RGBAFormat, HalfFloatType, PerspectiveCamera } from "three/webgpu";
import { texture, positionWorld, cameraPosition, normalWorld, dot, float, vec2, uniform, screenUV, smoothstep } from "three/tsl";
import { createRenderTarget } from "../../utils/renderTarget.js";
import { createIceMaterial } from "./iceMaterial.js";

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
 * Parallax ice floor with a half-resolution planar reflection of the cave,
 * screen and grid. Buried UV layers and area lighting share the cave material.
 */
export class IceGround extends Mesh {
  /**
   * @param {THREE.BufferGeometry} geometry - Ground plane geometry
   * @param {Object} options - { iceColor, iceBottom, iceRoughness, iceDisplacement, iceNormal } textures
   */
  constructor(geometry, options = {}) {
    // parallaxUV works in tangent space
    geometry.computeTangents();

    const { material, controls, surfaceNormal, trailTexture } = createIceMaterial(options);
    material.name = "IceGroundMaterial";
    super(geometry, material);
    Object.assign(this, controls);
    this.trailTexture = trailTexture;

    this._renderer = null;
    this._externalScene = null;
    this._screenScene = null;
    this._caveScene = null;
    this._reflectionTarget = null;
    this._virtualCamera = new PerspectiveCamera();
    this.reflectionStrength = uniform(0);
    this._reflectionStrengthValue = options.reflectionStrength ?? 0.7;
    this._dummyTexture = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat);
    this._dummyTexture.needsUpdate = true;
    this.externalTextureNode = texture(this._dummyTexture);

    const eyeDir = cameraPosition.sub(positionWorld).normalize();
    const facing = dot(eyeDir, normalWorld).clamp(0, 1);
    const fresnel = float(0.018).add(float(1).sub(facing).pow(5).mul(0.982));
    this.reflectionDistortion = uniform(options.reflectionDistortion ?? 0.012);
    this.reflectionOffsetX = options.reflectionOffsetX ?? 0;
    this.reflectionOffsetY = options.reflectionOffsetY ?? 0;
    const distortion = surfaceNormal.xy.mul(2).sub(1).mul(this.reflectionDistortion);
    const reflectionUV = vec2(float(1).sub(screenUV.x), screenUV.y).add(distortion);
    const pad = reflectionUV.min(float(1).sub(reflectionUV));
    const edge = smoothstep(0, 0.03, pad.x.min(pad.y));
    const reflection = this.externalTextureNode.sample(reflectionUV);
    material.emissiveNode = material.emissiveNode.add(
      reflection.rgb.mul(fresnel).mul(this.reflectionStrength).mul(edge),
    );
  }

  /**
   * Wire the external scenes whose mirrored render becomes the reflection
   */
  setExternalScenes(renderer, externalScene, screenScene, width, height, caveScene) {
    this._renderer = renderer;
    this._externalScene = externalScene;
    this._screenScene = screenScene;
    this._caveScene = caveScene;

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
    if (this.reflectionOffsetX || this.reflectionOffsetY) {
      // setViewOffset derives aspect from fullWidth / fullHeight, so the
      // pan window must match the camera aspect or the image stretches
      const fullHeight = 1024;
      const fullWidth = Math.max(1, Math.round(fullHeight * camera.aspect));
      this._virtualCamera.setViewOffset(
        fullWidth,
        fullHeight,
        this.reflectionOffsetX * fullWidth,
        this.reflectionOffsetY * fullHeight,
        fullWidth,
        fullHeight,
      );
    } else {
      this._virtualCamera.clearViewOffset();
    }
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

    const clearColor = this._renderer.getClearColor(new Color());
    const clearAlpha = this._renderer.getClearAlpha();
    const groundVisible = this.visible;
    this.visible = false;

    try {
      this._renderer.setRenderTarget(this._reflectionTarget);
      this._renderer.autoClear = true;
      this._renderer.setClearColor(0x000000, 0);
      if (this._caveScene) {
        this._renderer.render(this._caveScene, this._virtualCamera);
      } else {
        this._renderer.clear();
      }
      this._renderer.autoClear = false;

      if (this._screenScene) {
        this._renderer.render(this._screenScene, this._virtualCamera);
      }

      if (this._externalScene) {
        this._renderer.autoClear = false;
        this._renderer.render(this._externalScene, this._virtualCamera);
      }

    } finally {
      this.visible = groundVisible;
      this._renderer.setClearColor(clearColor, clearAlpha);
      this._renderer.setRenderTarget(currentRenderTarget);
      this._renderer.autoClear = currentAutoClear;

      for (const state of cullingStates) {
        state.obj.frustumCulled = state.frustumCulled;
      }

    }
    this.externalTextureNode.value = this._reflectionTarget.texture;
  }

  resizeReflection(width, height) {
    if (this._reflectionTarget) {
      this._reflectionTarget.setSize(width, height);
    }
  }

  setTrailTexture(trailTexture) {
    if (this.trailTexture) this.trailTexture.value = trailTexture;
  }

  setTrailEnabled(enabled) {
    this.trailEnabled.value = enabled ? 1 : 0;
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
