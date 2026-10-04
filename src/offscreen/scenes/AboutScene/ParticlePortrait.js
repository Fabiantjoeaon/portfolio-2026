import { cameraFov } from "@/shared/cameraFraming";
import { mobileSettings } from "@/shared/mobileSettings";
import { getFlag } from "@/offscreen/lib/query";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { createPortraitMaterial } from "./portraitMaterial.js";
import { store } from "@/offscreen/store";
import { mouse } from "@/offscreen/input/MouseTracker";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";
import { timingEase } from "@/offscreen/lib/customEases";
import { timings } from "@/shared/timings";

function applyMobilePortrait(uniforms) {
  const portrait = mobileSettings.portrait;
  for (const key in uniforms) {
    const value = portrait[key];
    if (value == null) continue;
    const current = uniforms[key].value;
    if (current?.isColor) current.set(value);
    else if (current?.isVector3) {
      if (value.isVector3) current.copy(value);
      else current.fromArray(value);
    } else uniforms[key].value = value;
  }
}

// head.bin is written by scripts/pack-portrait.mjs: a count and position bounds,
// then Uint16 positions, Int8 normals and Uint8 luminances.
// Instanced sprites allow sized particles on both WebGPU and WebGL.
export default class ParticlePortrait {
  constructor(scene, values, cameraState) {
    this.scene = scene;
    this.values = values;
    this.cameraState = cameraState;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.uniforms = {};
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith("portrait")) {
        this.uniforms[key] = uniform(
          key.endsWith("Color") ? new THREE.Color(value)
            : Array.isArray(value) ? new THREE.Vector3().fromArray(value) : value,
        );
      }
    }
    this.time = uniform(0);
    this.reveal = uniform(1);
    this.pageOpacity = uniform(1);
    this._revealProgress = 1;
    this.lightPosition = uniform(new THREE.Vector3());
    this.hoverPoint = uniform(new THREE.Vector2(0, 4));
    this.worldScale = uniform(1);
    this.renderScale = uniform(1);
    this.pointer = new THREE.Vector2();
    this.pageScroll = 0;
    this._basis = new THREE.Matrix4();
    this._rotation = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this._offset = new THREE.Vector3();
    this._hoverWorld = new THREE.Vector3();
    this._hoverLocal = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._camUp = new THREE.Vector3();
    this._inverseQuat = new THREE.Quaternion();
    this._pointerActive = false;
    this._abort = new AbortController();
    this.ready = this._load().catch((error) => {
      if (error.name !== "AbortError") console.error("[AboutScene] Portrait could not load", error);
    });
  }

  async _load() {
    const response = await fetch(resolvePublicPath("assets/about/head.bin"), {
      signal: this._abort.signal,
    });
    if (!response.ok) throw new Error(`head.bin: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (this._disposed) return;
    const header = new DataView(buffer);
    const count = buffer.byteLength >= 28 ? header.getUint32(0, true) : 0;
    if (!count || buffer.byteLength !== 28 + count * 10) throw new Error("head.bin has an unexpected size");
    const bounds = new THREE.Box3(
      new THREE.Vector3(header.getFloat32(4, true), header.getFloat32(8, true), header.getFloat32(12, true)),
      new THREE.Vector3(header.getFloat32(16, true), header.getFloat32(20, true), header.getFloat32(24, true)),
    );
    const size = bounds.getSize(new THREE.Vector3());
    if (size.y <= 0) throw new Error("head.bin has no vertical extent");
    const center = bounds.getCenter(new THREE.Vector3());
    this.aspect = size.x / size.y;

    const packedPositions = new Uint16Array(buffer, 28, count * 3);
    const packedNormals = new Int8Array(buffer, 28 + count * 6, count * 3);
    const packedLuminances = new Uint8Array(buffer, 28 + count * 9, count);
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const luminances = new Float32Array(count);
    const min = bounds.min.toArray();
    const range = size.toArray();
    const mid = center.toArray();
    for (let i = 0; i < count * 3; i++) {
      const axis = i % 3;
      positions[i] = (min[axis] + packedPositions[i] / 65535 * range[axis] - mid[axis]) / size.y;
      normals[i] = packedNormals[i] / 127;
    }
    for (let i = 0; i < count; i++) luminances[i] = packedLuminances[i] / 255;

    const material = createPortraitMaterial({
      positions, normals, luminances, aspect: this.aspect,
      depthBounds: [(bounds.min.z - center.z) / size.y, (bounds.max.z - center.z) / size.y],
      uniforms: this.uniforms, time: this.time, reveal: this.reveal,
      lightPosition: this.lightPosition, worldScale: this.worldScale,
      hoverPoint: this.hoverPoint,
    });
    material.sizeNode = material.sizeNode.mul(this.renderScale);
    // Portrait uses additive ONE + ONE blending, so fade radiance as well as alpha.
    material.colorNode = material.colorNode.mul(this.pageOpacity);
    this.sprite = new THREE.Sprite(material);
    // Sprite's default geometry is shared; own the copy for safe disposal.
    this.sprite.geometry = this.sprite.geometry.clone();
    this.sprite.count = this.count = count;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = 2;
    this.group.add(this.sprite);
  }

  prepareReveal() {
    this._revealActive = false;
    this._revealProgress = 0;
    this.reveal.value = 0;
  }

  startReveal({ immediate = false, delay = 0 } = {}) {
    this._revealActive = true;
    this._revealDelay = delay;
    this._revealProgress = immediate ? 1 : 0;
    this.reveal.value = this._revealProgress;
  }

  update(delta) {
    const u = this.uniforms;
    this.group.visible = u.portraitEnabled.value;
    this.time.value += delta;
    if (this._revealActive && this._revealDelay > 0) this._revealDelay -= delta;
    else if (this._revealActive) this._revealProgress = Math.min(1, this._revealProgress + delta / Math.max(timings.about.portraitIn, 0.001));
    this.reveal.value = timingEase(timings.about.ease)(this._revealProgress);
    if (!this.sprite) return;
    const { position, lookAt } = this.cameraState;
    const { width, height } = store.viewport;
    // The file is shuffled; a prefix preserves its distribution.
    const touch = getFlag("touchExperience");
    if (touch) applyMobilePortrait(u);
    const densityScale = u.portraitResponsiveDensity.value ? Math.min(1, (width / 1280) ** 2) : 1;
    this.sprite.count = Math.round(this.count * u.portraitDensity.value * densityScale);
    const viewHeight = 2 * position.distanceTo(lookAt) * Math.tan(THREE.MathUtils.degToRad(cameraFov(this.cameraState, width / height, touch) / 2));
    const viewWidth = viewHeight * width / Math.max(height, 1);
    const narrow = width <= 700;
    const mobileLayout = touch || narrow;
    const wideTouch = touch && !narrow;
    const fitHeight = mobileLayout ? (wideTouch ? mobileSettings.portraitLandscapeFitHeight : mobileSettings.portraitFitHeight) : 0.8;
    const fitWidth = mobileLayout ? (wideTouch ? mobileSettings.portraitLandscapeFitWidth : mobileSettings.portraitFitWidth) : 0.44;
    const mobilePortrait = mobileSettings.portrait;
    const offsetX = wideTouch ? mobileSettings.portraitLandscapeOffsetX : mobileLayout ? mobilePortrait.portraitX : u.portraitX.value;
    const offsetY = wideTouch ? mobileSettings.portraitLandscapeOffsetY : mobileLayout ? mobilePortrait.portraitY : u.portraitY.value;
    const scale = Math.min(viewHeight * fitHeight, viewWidth * fitWidth / this.aspect) * u.portraitScale.value;
    this.group.scale.setScalar(scale);
    this.worldScale.value = scale;
    this._basis.lookAt(position, lookAt, THREE.Object3D.DEFAULT_UP);
    this.group.quaternion.setFromRotationMatrix(this._basis);
    this._offset.set(
      viewWidth * offsetX,
      viewHeight * (offsetY + this.pageScroll / Math.max(height, 1)),
      0,
    )
      .applyQuaternion(this.group.quaternion);
    this.group.position.copy(lookAt).add(this._offset);
    this.pointer.lerp(mouse, 1 - Math.exp(-delta * 4));
    this._offset.set(this.pointer.x, this.pointer.y, 0).multiplyScalar(u.portraitMouseLight.value);
    this.lightPosition.value.copy(u.portraitLightDirection.value).add(this._offset)
      .multiplyScalar(scale).applyQuaternion(this.group.quaternion).add(this.group.position);
    const toRad = THREE.MathUtils.degToRad;
    this._euler.set(
      toRad(u.portraitRotationX.value - this.pointer.y * u.portraitMouseTilt.value),
      toRad(u.portraitRotationY.value + this.pointer.x * u.portraitMouseTilt.value),
      toRad(u.portraitRotationZ.value),
    );
    this.group.quaternion.multiply(this._rotation.setFromEuler(this._euler));
    if (!this._pointerActive && mouse.x * mouse.x + mouse.y * mouse.y > 1e-4) this._pointerActive = true;
    if (this._pointerActive) {
      this._camRight.setFromMatrixColumn(this._basis, 0);
      this._camUp.setFromMatrixColumn(this._basis, 1);
      this._hoverWorld.copy(lookAt)
        .addScaledVector(this._camRight, this.pointer.x * viewWidth * 0.5)
        .addScaledVector(this._camUp, this.pointer.y * viewHeight * 0.5);
      this._hoverLocal.copy(this._hoverWorld).sub(this.group.position)
        .applyQuaternion(this._inverseQuat.copy(this.group.quaternion).invert())
        .divideScalar(Math.max(scale, 1e-4));
      this.hoverPoint.value.set(this._hoverLocal.x, this._hoverLocal.y);
    }
  }

  resolveDebugTarget(key) {
    return this.uniforms[key] ? { uniform: this.uniforms[key] } : null;
  }

  dispose() {
    this._disposed = true;
    this._abort.abort();
    this.sprite?.geometry.dispose();
    this.sprite?.material.dispose();
    this.group.removeFromParent();
  }
}
