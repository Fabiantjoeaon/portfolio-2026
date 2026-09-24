import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { uniform, mix, pow, clamp } from "three/tsl";
import { CubeWalls, travelingGlowField } from "./CubeWalls.js";
import { store } from "@/offscreen/store";
import { createSSAO } from "../../postprocessing/ssao.js";
import {
  bindParamGroup,
  getDebugFolder,
} from "@/offscreen/debug/bindDebugParams";
import { params, paramValues } from "@/offscreen/params";

const cube = paramValues(params.CubeScene);
const ROOM_HEIGHT = cube.ceilY - cube.floorY;
const ROOM_DEPTH = cube.frontZ - cube.backZ;
const ROOM_CENTER = new THREE.Vector3(
  0,
  (cube.floorY + cube.ceilY) * 0.5,
  (cube.backZ + cube.frontZ) * 0.5,
);

/**
 * CubeScene - the viewer stands inside a dark grey room whose six surfaces
 * are living treemaps of extruded cubes. Light bleeds through the animated
 * gaps between the cubes, as if a bright source sits behind every surface.
 *
 * Global illumination is a per-surface hemisphere (sky on the inward face,
 * ground on the sides) plus emissive spill in the gaps. No directional lights
 * or shadow maps — those banded the walls and popped the glow.
 */
export default class CubeScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = config.name || "CubeScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3().fromArray(cube.position),
      lookAt: new THREE.Vector3().fromArray(cube.lookAt),
      fov: cube.fov,
      hoverPos: new THREE.Vector3(1, 1, 0),
      hoverRate: 0.05,
    };

    this.walls = null;
    this.glowShell = null;

    this.scene.background = new THREE.Color(cube.background);
    // Skip IBL: RoomEnvironment irradiance is a huge soft gradient on any
    // upward-facing Lambert/rough surface, which is exactly the floor bands.

    this._ssao = createSSAO({
      scene: this.scene,
      aoRadius: cube.aoRadius,
      intensity: cube.aoIntensity,
      quality: cube.aoQuality,
    });
    // this.postprocessingChain = [this._ssao];

    this.init();
  }

  init() {
    this.walls = new CubeWalls({
      width: cube.width,
      height: ROOM_HEIGHT,
      depth: ROOM_DEPTH,
      center: ROOM_CENTER,
      screenLight: this.screenLight,
    });
    this.scene.add(this.walls);

    const shellPad = cube.shellPad;
    this._shellBase = new THREE.Vector3(
      cube.width + shellPad,
      ROOM_HEIGHT + shellPad,
      ROOM_DEPTH + shellPad,
    );
    const shellGeometry = new THREE.BoxGeometry(
      this._shellBase.x,
      this._shellBase.y,
      this._shellBase.z,
    );
    const shellMaterial = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
    });
    const u = this.walls.uniforms;
    this._shellGlowMin = uniform(cube.shellGlowMin);
    this._shellGlowMax = uniform(cube.shellGlowMax);
    const glowField = travelingGlowField(
      u.glowNoiseScale,
      u.glowNoiseSpeed,
      u.time,
    );
    shellMaterial.colorNode = u.glowColor.mul(
      mix(
        this._shellGlowMin,
        this._shellGlowMax,
        pow(clamp(glowField, 0.0, 1.0), u.glowContrast),
      ),
    );
    this.glowShell = new THREE.Mesh(shellGeometry, shellMaterial);
    this.glowShell.position.copy(ROOM_CENTER);
    this.glowShell.castShadow = false;
    this.glowShell.receiveShadow = false;
    this.scene.add(this.glowShell);
  }

  attachDebug(gui, { sceneManager } = {}) {
    if (!gui) return;
    const folder = getDebugFolder(gui, "CubeScene");
    if (folder._debugBound) return;
    folder._debugBound = true;

    const camera = sceneManager?.cameraController?.camera;

    bindParamGroup(
      gui,
      params.CubeScene,
      (key) => {
        if (key === "background") {
          return { object: this.scene, property: "background" };
        }
        if (key === "fov") {
          return {
            object: this.cameraState,
            property: "fov",
            onChange: (v) => {
              if (!camera) return;
              camera.fov = v;
              camera.updateProjectionMatrix();
            },
          };
        }
        if (key === "shellGlowMin") return { uniform: this._shellGlowMin };
        if (key === "shellGlowMax") return { uniform: this._shellGlowMax };
        if (this.walls?.uniforms[key]) {
          return { uniform: this.walls.uniforms[key] };
        }
        return null;
      },
      "CubeScene",
    );
  }

  update(time) {
    if (!this.walls) return;

    this.walls.update(time * 0.001);

    if (this.glowShell && this._shellBase) {
      const u = this.walls.uniforms;
      const keep = Math.max(
        0,
        u.depthMax.value + u.faceBulge.value + (u.cornerInset?.value ?? 0),
      );
      this.glowShell.scale.set(
        (this._shellBase.x + 2 * keep) / this._shellBase.x,
        1,
        (this._shellBase.z + 2 * keep) / this._shellBase.z,
      );
    }

    const gl = store.gl;
    if (!gl || gl.isDeviceValid === false) return;

    if (gl.safeCompute) {
      gl.safeCompute(this.walls.computeNode);
    } else {
      gl.compute(this.walls.computeNode);
    }
  }

  dispose() {
    if (this.walls) {
      this.walls.dispose();
      this.walls = null;
    }

    if (this.glowShell) {
      this.glowShell.geometry.dispose();
      this.glowShell.material.dispose();
      this.glowShell = null;
    }

    this._ssao?.dispose();
    this._ssao = null;
  }
}
