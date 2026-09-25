import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";
import {
  Fn,
  uniform,
  positionLocal,
  normalize,
  smoothstep,
  mix,
  vec3,
  vec4,
  float,
  abs,
  time,
  mx_noise_float,
} from "three/tsl";
import BaseScene from "./BaseScene.js";
import {
  bindParamGroup,
  getDebugFolder,
} from "@/offscreen/debug/bindDebugParams";
import { paramValues } from "@/offscreen/params";

/**
 * Shared backdrop for pinned pages (project / about): a big backside sphere
 * with an animated vertical gradient acts as a skybox. Subclasses pass their
 * `params.js` group (camera + sky leaves) and add their own content on top.
 */
export default class SkySphereScene extends BaseScene {
  constructor(config = {}, { name = "SkySphereScene", paramGroup = null } = {}) {
    super(config);
    this.name = name;
    this._paramGroup = paramGroup;

    const values = paramValues(paramGroup);
    this._values = values;

    this.cameraState = {
      position: new THREE.Vector3().fromArray(values.position),
      lookAt: new THREE.Vector3().fromArray(values.lookAt),
      fov: values.fov,
      hoverPos: new THREE.Vector3(1, 1, 0),
      hoverRate: 0.05,
    };

    this.uniforms = {
      skyTop: uniform(new THREE.Color(values.skyTop)),
      skyMid: uniform(new THREE.Color(values.skyMid)),
      skyBottom: uniform(new THREE.Color(values.skyBottom)),
      horizonColor: uniform(new THREE.Color(values.horizonColor)),
      horizonHeight: uniform(values.horizonHeight),
      horizonWidth: uniform(values.horizonWidth),
      horizonStrength: uniform(values.horizonStrength),
      skySpread: uniform(values.skySpread),
      skyNoiseScale: uniform(values.skyNoiseScale),
      skyNoiseAmount: uniform(values.skyNoiseAmount),
      skyNoiseSpeed: uniform(values.skyNoiseSpeed),
      skyCloudScale: uniform(values.skyCloudScale),
      skyCloudAmount: uniform(values.skyCloudAmount),
      skyCloudSpeed: uniform(values.skyCloudSpeed),
      pageScroll: uniform(0),
    };

    this._setupSky();
  }

  _setupSky() {
    const u = this.uniforms;
    const material = new NodeMaterial();
    material.name = `${this.name}Sky`;
    material.side = THREE.BackSide;
    material.depthWrite = false;

    material.colorNode = Fn(() => {
      const dir = normalize(positionLocal);
      const noisePosition = dir
        .sub(vec3(0.0, u.pageScroll.mul(0.16), 0.0))
        .toVar();
      // Compress the gradient into the slice the narrow-FOV camera sees
      const h = noisePosition.y.mul(u.skySpread).mul(0.5).add(0.5).clamp(0.0, 1.0);

      // Drifting noise wobbles the gradient stops so the sky never bands
      const n = mx_noise_float(
        noisePosition
          .mul(u.skyNoiseScale)
          .add(vec3(0.0, time.mul(u.skyNoiseSpeed), 0.0)),
      );
      const hh = h.add(n.mul(u.skyNoiseAmount)).clamp(0.0, 1.0);

      const lower = mix(
        vec3(u.skyBottom),
        vec3(u.skyMid),
        smoothstep(0.0, 0.55, hh),
      );
      const sky = mix(lower, vec3(u.skyTop), smoothstep(0.45, 1.0, hh));

      // Soft glow band around the horizon line
      const band = smoothstep(
        u.horizonWidth,
        float(0.0),
        abs(hh.sub(u.horizonHeight)),
      );
      const glow = vec3(u.horizonColor).mul(band.mul(u.horizonStrength));

      // Slow two-octave cloud field modulating the gradient's luminance —
      // the smoky, mysterious drift on top of the flat gray gradient
      const cloudPos = noisePosition
        .mul(u.skyCloudScale)
        .add(
          vec3(
            time.mul(u.skyCloudSpeed),
            time.mul(u.skyCloudSpeed).mul(0.6),
            0.0,
          ),
        );
      const cloud = mx_noise_float(cloudPos)
        .add(mx_noise_float(cloudPos.mul(2.7).add(vec3(13.7))).mul(0.45));
      const cloudLift = cloud.mul(u.skyCloudAmount).add(1.0).max(0.0);

      return vec4(sky.add(glow).mul(cloudLift), float(1.0));
    })();

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 32), material);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  setPageScroll(scroll, viewportHeight = 1) {
    this.uniforms.pageScroll.value = scroll / Math.max(viewportHeight, 1);
  }

  attachDebug(gui, { sceneManager } = {}) {
    if (!gui || !this._paramGroup) return;
    const folder = getDebugFolder(gui, this.name);
    if (folder._debugBound) return;
    folder._debugBound = true;

    bindParamGroup(
      gui,
      this._paramGroup,
      (key) => this._resolveDebugTarget(key, sceneManager),
      this.name,
    );
  }

  /**
   * Map a params.js leaf key to a live debug target. Subclasses extend this
   * for their own uniforms/values and fall back to super for the sky.
   */
  _resolveDebugTarget(key, sceneManager) {
    const u = this.uniforms[key];
    return u ? { uniform: u } : null;
  }

  dispose() {
    if (this.sky) {
      this.sky.geometry.dispose();
      this.sky.material.dispose();
      this.scene.remove(this.sky);
      this.sky = null;
    }
  }
}
