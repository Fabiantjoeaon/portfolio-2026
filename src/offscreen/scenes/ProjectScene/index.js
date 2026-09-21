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
import BaseScene from "../BaseScene.js";
import {
  bindParamGroup,
  getDebugFolder,
} from "@/offscreen/debug/bindDebugParams";
import { params, paramValues } from "@/offscreen/params";

const project = paramValues(params.ProjectScene);

/**
 * Destination scene when a project tile is clicked (routes to
 * /project/[slug]). Not part of the auto-cycling sequence — the
 * TransitionManager pins it until the project is closed.
 *
 * A big backside sphere with an animated vertical gradient acts as a
 * skybox; the persistent screen (project hero video) floats in front.
 */
export default class ProjectScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = "ProjectScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3().fromArray(project.position),
      lookAt: new THREE.Vector3().fromArray(project.lookAt),
      fov: project.fov,
    };

    this.uniforms = {
      skyTop: uniform(new THREE.Color(project.skyTop)),
      skyMid: uniform(new THREE.Color(project.skyMid)),
      skyBottom: uniform(new THREE.Color(project.skyBottom)),
      horizonColor: uniform(new THREE.Color(project.horizonColor)),
      horizonHeight: uniform(project.horizonHeight),
      horizonWidth: uniform(project.horizonWidth),
      horizonStrength: uniform(project.horizonStrength),
      skySpread: uniform(project.skySpread),
      skyNoiseScale: uniform(project.skyNoiseScale),
      skyNoiseAmount: uniform(project.skyNoiseAmount),
      skyNoiseSpeed: uniform(project.skyNoiseSpeed),
    };

    this._setupSky();
  }

  _setupSky() {
    const u = this.uniforms;
    const material = new NodeMaterial();
    material.name = "ProjectSky";
    material.side = THREE.BackSide;
    material.depthWrite = false;

    material.colorNode = Fn(() => {
      const dir = normalize(positionLocal);
      // Compress the gradient into the slice the narrow-FOV camera sees
      const h = dir.y.mul(u.skySpread).mul(0.5).add(0.5).clamp(0.0, 1.0);

      // Drifting noise wobbles the gradient stops so the sky never bands
      const n = mx_noise_float(
        dir.mul(u.skyNoiseScale).add(vec3(0.0, time.mul(u.skyNoiseSpeed), 0.0)),
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

      return vec4(sky.add(glow), float(1.0));
    })();

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 32), material);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  attachDebug(gui) {
    if (!gui) return;
    const folder = getDebugFolder(gui, "ProjectScene");
    if (folder._debugBound) return;
    folder._debugBound = true;

    bindParamGroup(
      gui,
      params.ProjectScene,
      (key) => {
        const u = this.uniforms[key];
        return u ? { uniform: u } : null;
      },
      "ProjectScene",
    );
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
