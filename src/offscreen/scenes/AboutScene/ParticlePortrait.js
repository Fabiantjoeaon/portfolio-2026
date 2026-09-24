import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { createPortraitMaterial } from "./portraitMaterial.js";
import { store } from "@/offscreen/store";
import { mouse } from "@/offscreen/input/MouseTracker";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";

// head.buf: little-endian Float32 [x, y, z, nx, ny, nz, luminance].
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
    this._revealProgress = 1;
    this.lightPosition = uniform(new THREE.Vector3());
    this.worldScale = uniform(1);
    this.renderScale = uniform(1);
    this.pointer = new THREE.Vector2();
    this._basis = new THREE.Matrix4();
    this._rotation = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this._offset = new THREE.Vector3();
    this._abort = new AbortController();
    this.ready = this._load().catch((error) => {
      if (error.name !== "AbortError") console.error("[AboutScene] Portrait could not load", error);
    });
  }

  async _load() {
    const response = await fetch(resolvePublicPath("assets/about/head.buf"), {
      signal: this._abort.signal,
    });
    if (!response.ok) throw new Error(`head.buf: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (this._disposed) return;
    if (!buffer.byteLength || buffer.byteLength % 28 !== 0) {
      throw new Error("head.buf must contain seven Float32 values per particle");
    }
    const data = new DataView(buffer);
    const count = buffer.byteLength / 28;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const luminances = new Float32Array(count);
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const row = [];
      for (let j = 0; j < 7; j++) {
        const value = data.getFloat32(i * 28 + j * 4, true);
        if (!Number.isFinite(value)) throw new Error("head.buf contains a non-finite attribute");
        row.push(value);
      }
      positions.set(row.slice(0, 3), i * 3);
      normals.set(row.slice(3, 6), i * 3);
      luminances[i] = THREE.MathUtils.clamp(row[6], 0, 1);
      bounds.expandByPoint(point.fromArray(positions, i * 3));
    }
    const size = bounds.getSize(new THREE.Vector3());
    if (size.y <= 0) throw new Error("head.buf has no vertical extent");
    const center = bounds.getCenter(new THREE.Vector3());
    this.aspect = size.x / size.y;
    for (let i = 0; i < count; i++) {
      point.fromArray(positions, i * 3).sub(center).divideScalar(size.y);
      point.toArray(positions, i * 3);
    }

    const material = createPortraitMaterial({
      positions, normals, luminances, aspect: this.aspect,
      depthBounds: [(bounds.min.z - center.z) / size.y, (bounds.max.z - center.z) / size.y],
      uniforms: this.uniforms, time: this.time, reveal: this.reveal,
      lightPosition: this.lightPosition, worldScale: this.worldScale,
    });
    material.sizeNode = material.sizeNode.mul(this.renderScale);
    this.sprite = new THREE.Sprite(material);
    // Sprite's default geometry is shared; own the copy for safe disposal.
    this.sprite.geometry = this.sprite.geometry.clone();
    this.sprite.count = this.count = count;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = 2;
    this.group.add(this.sprite);
  }

  startReveal({ immediate = false } = {}) {
    this._revealProgress = immediate ? 1 : 0;
    this.reveal.value = this._revealProgress;
  }

  update(delta) {
    const u = this.uniforms;
    this.group.visible = u.portraitEnabled.value;
    this.time.value += delta;
    this._revealProgress = Math.min(1, this._revealProgress + delta / Math.max(u.portraitRevealDuration.value, 0.001));
    this.reveal.value = this._revealProgress;
    if (!this.sprite) return;
    const { position, lookAt, fov } = this.cameraState;
    const { width, height } = store.viewport;
    // The file is shuffled; a prefix preserves its distribution. Reduce
    // overlap on narrow screens so the small portrait stays translucent.
    const densityScale = u.portraitResponsiveDensity.value ? Math.min(1, (width / 1280) ** 2) : 1;
    this.sprite.count = Math.round(this.count * u.portraitDensity.value * densityScale);
    const viewHeight = 2 * position.distanceTo(lookAt) * Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const viewWidth = viewHeight * width / Math.max(height, 1);
    const scale = Math.min(viewHeight * 0.8, viewWidth * 0.44 / this.aspect) * u.portraitScale.value;
    this.group.scale.setScalar(scale);
    this.worldScale.value = scale;
    this._basis.lookAt(position, lookAt, THREE.Object3D.DEFAULT_UP);
    this.group.quaternion.setFromRotationMatrix(this._basis);
    this._offset.set(viewWidth * u.portraitX.value, viewHeight * u.portraitY.value, 0)
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
