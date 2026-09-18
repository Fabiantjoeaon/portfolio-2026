import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { positionWorld, time, mx_noise_float, uniform } from "three/tsl";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
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
const GLOW_COLOR = 0x4169e1;

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

    // Fake GI bounce: env-map irradiance (set up lazily) does the soft
    // directional shading; a dim ambient and a glow-tinted point light in the
    // room center stand in for the light bouncing out of the gaps
    const ambient = new THREE.AmbientLight(0xa8aeb8, 0);
    this.scene.add(ambient);

    const bounce = new THREE.PointLight(GLOW_COLOR, 160, 0, 2);
    bounce.position.set(0, 2, 0);
    this.scene.add(bounce);
  }

  // Matte surfaces need soft directional irradiance to read as lit; the
  // fully-rough material shows no specular reflection of it. Lazy because
  // store.gl isn't available at construction time.
  _setupEnvironment() {
    if (this._envInitialized || !store.gl) return;
    this._envInitialized = true;

    const pmremGenerator = new THREE.PMREMGenerator(store.gl);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
    ).texture;
    this.scene.environmentIntensity = 0.25;
    pmremGenerator.dispose();
  }

  update(time) {
    if (!this.walls) return;

    this._setupEnvironment();
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
