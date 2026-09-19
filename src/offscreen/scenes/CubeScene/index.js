import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { positionWorld, time, mx_noise_float, uniform } from "three/tsl";
import { CubeWalls } from "./CubeWalls.js";
import { GROUND_Y } from "../../managers/SceneManager.js";
import { store } from "@/offscreen/store";
import { createSSAO } from "../../postprocessing/ssao.js";

// Wide, short room: floor sits at GROUND_Y (just under the tile grid) and
// the box extends behind the camera so no wall sits in front of the lens.
const FLOOR_Y = GROUND_Y;
const CEIL_Y = 25;
const BACK_Z = -44;
const FRONT_Z = 105;
const ROOM_WIDTH = 110;
const ROOM_HEIGHT = CEIL_Y - FLOOR_Y;
const ROOM_DEPTH = FRONT_Z - BACK_Z;
const ROOM_CENTER = new THREE.Vector3(
  0,
  (FLOOR_Y + CEIL_Y) * 0.5,
  (BACK_Z + FRONT_Z) * 0.5,
);
const GLOW_COLOR = 0x4169e1;

/**
 * CubeScene - the viewer stands inside a dark grey room whose six surfaces
 * are living treemaps of extruded cubes. Light bleeds through the animated
 * gaps between the cubes, as if a bright source sits behind every surface.
 *
 * Global illumination is approximated (real-time GI is not affordable here):
 * the emissive shell behind the panels is the light source, the cube sides
 * carry an analytic spill gradient from it, and a hemisphere + directional
 * key stand in for bounce — no point lights, whose inverse-square falloff
 * banded the floor.
 */
export default class CubeScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = config.name || "CubeScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3(0, 7, 60),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 34,
    };

    this.walls = null;
    this.glowShell = null;

    this.scene.background = new THREE.Color(0x121214);
    // Skip IBL: RoomEnvironment irradiance is a huge soft gradient on any
    // upward-facing Lambert/rough surface, which is exactly the floor bands.

    this._ssao = createSSAO({
      radius: 50,
      intensity: 3.5,
      samples: 16,
    });
    // this.postprocessingChain = [this._ssao];

    this.init();
  }

  init() {
    this.walls = new CubeWalls({
      width: ROOM_WIDTH,
      height: ROOM_HEIGHT,
      depth: ROOM_DEPTH,
      center: ROOM_CENTER,
      targetCellSize: 10,
      subdivisions: 6,
      glowColor: GLOW_COLOR,
    });
    this.scene.add(this.walls);

    // The light source behind all six surfaces: a slightly larger emissive
    // box whose inside faces show through the gaps between the cubes
    const shellPad = 0;
    const shellGeometry = new THREE.BoxGeometry(
      ROOM_WIDTH + shellPad,
      ROOM_HEIGHT + shellPad,
      ROOM_DEPTH + shellPad,
    );
    const shellMaterial = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
    });
    this._glowUniform = uniform(new THREE.Color(GLOW_COLOR));
    // Slow large-scale drift so the backlight itself feels alive
    shellMaterial.colorNode = this._glowUniform.mul(
      mx_noise_float(positionWorld.mul(0.12).add(time.mul(0.04)))
        .mul(0.3)
        .add(0.5),
    );
    this.glowShell = new THREE.Mesh(shellGeometry, shellMaterial);
    this.glowShell.position.copy(ROOM_CENTER);
    this.scene.add(this.glowShell);

    // Fake bounce with no spatial falloff: Lambert N·L is constant per face,
    // so the floor stays one crisp shade instead of a radial gradient.
    // Hemisphere sky is neutral on purpose — a glow-colored sky turned every
    // upward face into a large blue field that posterized.
    const ambient = new THREE.AmbientLight(0xb4b8c0, 0.7);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xd8dce4, 0x1a1a20, 0.55);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xf4f2ec, 2.1);
    key.position.set(-8, 22, 16);
    this.scene.add(key);
  }

  update(time) {
    if (!this.walls) return;

    this.walls.update(time * 0.001);

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
