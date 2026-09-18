import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { positionWorld, time, mx_noise_float, uniform } from "three/tsl";
import { CubeWalls } from "./CubeWalls.js";
import { GROUND_Y } from "../../managers/SceneManager.js";
import { store } from "@/offscreen/store";

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
const GLOW_COLOR = 0xdfe8f5;

/**
 * CubeScene - the viewer stands inside a dark grey room whose six surfaces
 * are living treemaps of extruded cubes. Light bleeds through the animated
 * gaps between the cubes, as if a bright source sits behind every surface.
 *
 * Global illumination is approximated (real-time GI is not affordable here):
 * the emissive shell behind the panels is the light source, the cube sides
 * carry an analytic spill gradient from it, and a dim ambient + a soft
 * glow-tinted point light stand in for the bounce.
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

    // Fake GI bounce: dim cool ambient plus a soft glow-tinted light in the
    // room center so the matte grey faces read as lit by the gap light
    const ambient = new THREE.AmbientLight(0xa8aeb8, 3.2);
    this.scene.add(ambient);

    const bounce = new THREE.PointLight(GLOW_COLOR, 100, 0, 2);
    bounce.position.set(0, 2, 0);
    this.scene.add(bounce);
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
  }
}
