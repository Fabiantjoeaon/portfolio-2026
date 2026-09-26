import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { uniform, mix, pow, clamp } from "three/tsl";
import {
  CubeWalls,
  FLOW_ATLAS_COLS,
  FLOW_ATLAS_ROWS,
  travelingGlowField,
} from "./CubeWalls.js";
import { store } from "@/offscreen/store";
import { createSSAO } from "../../postprocessing/ssao.js";
import {
  bindParamGroup,
  getDebugFolder,
} from "@/offscreen/debug/bindDebugParams";
import { params, paramValues } from "@/offscreen/params";
import { ParticleSystem } from "../../particles/ParticleSystem.js";
import { createGlyphAppearance } from "../../particles/glyphAppearance.js";
import { loadMSDFFont } from "../../utils/msdfFont.js";
import { PointerFeedbackMap } from "../../effects/PointerFeedbackMap.js";
import { PointerRaycaster } from "../../input/PointerRaycaster.js";
import { PointerStroke } from "../../input/PointerStroke.js";
import { HoverChange } from "../../input/HoverChange.js";
import { dampFactor } from "../../lib/damp.js";
import { audio } from "@/audio/audio.js";

const cube = paramValues(params.CubeScene);
const CUBE_GLOW_COLORS = Object.freeze([
  0x246bff, // blue
  0xff3347, // red
  0xff7a1a, // orange
  0x9b5cff, // purple
  0x35d07f, // green
]);
const NOOP = () => {};
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
    this._glowColorIndex = -1;

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
    this._glyphSettings = { ...paramValues(params.CubeScene.Particles), ...config.settings };
    for (const key of ["glyphOrigin", "glyphBounds", "glyphVelocity"])
      this._glyphSettings[key] = new THREE.Vector3().fromArray(this._glyphSettings[key]);
    this.ready = this._initParticles();
  }

  async _initParticles() {
    const { font, map } = await loadMSDFFont();
    if (this._disposed) return;
    const glyph = createGlyphAppearance({ font, map });
    this._glyphAppearance = glyph;
    this.glyphControls = glyph.controls;
    this.particles = new ParticleSystem({ appearance: glyph.appearance, maxCount: 1000 });
    this.particles.name = "Floating Space Mono symbols";
    this.scene.add(this.particles);
    this._syncParticles();
  }

  _syncParticles() {
    if (!this.particles) return;
    const settings = {};
    for (const [key, value] of Object.entries(this._glyphSettings)) {
      if (key.startsWith("glyph")) settings[key[5].toLowerCase() + key.slice(6)] = value;
    }
    this.particles.configure(settings);
    this.glyphControls.interval.value = settings.interval;
    this.glyphControls.intervalVariation.value = settings.intervalVariation;
    this.glyphControls.glow.value = settings.glow;
    this.glyphControls.glowRadius.value = settings.glowRadius;
  }

  init() {
    this.flowEnabled = cube.flowEnabled;
    this.flowResolution = Number(cube.flowResolution);
    this.flowVelocityScale = cube.flowVelocityScale;
    this.flow = new PointerFeedbackMap({
      mode: "flow",
      width: this.flowResolution * FLOW_ATLAS_COLS,
      height: this.flowResolution * FLOW_ATLAS_ROWS,
      radius: cube.flowRadius,
      fade: cube.flowFade,
      diffusion: cube.flowDiffusion,
      advection: cube.flowAdvection,
      brushScale: new THREE.Vector2(1 / FLOW_ATLAS_COLS, 1 / FLOW_ATLAS_ROWS),
    });
    this.projector = new PointerRaycaster();
    this.stroke = new PointerStroke({ speedScale: 80 });
    this.hover = new HoverChange(-1);
    this._pick = { id: -1, surface: -1, u: 0, v: 0, point: new THREE.Vector3() };
    this._liftedPick = { id: -1, surface: -1, u: 0, v: 0, point: new THREE.Vector3() };
    this._pickSurface = -1;
    this._atlas = new THREE.Vector2();
    this._prevAtlas = new THREE.Vector2();
    this._rawVelocity = new THREE.Vector2();
    this._velocity = new THREE.Vector2();
    this._time = 0;
    this._delta = 0;
    this.interactionEnabled = true;

    this.walls = new CubeWalls({
      width: cube.width,
      height: ROOM_HEIGHT,
      depth: ROOM_DEPTH,
      center: ROOM_CENTER,
      screenLight: this.screenLight,
      flowTexture: this.flow.texture,
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

  onEnter() {
    this._glowColorIndex =
      (this._glowColorIndex + 1) % CUBE_GLOW_COLORS.length;
    const color = CUBE_GLOW_COLORS[this._glowColorIndex];
    this.walls?.uniforms.glowColor.value.set(color);
    this._glyphSettings.glyphColor = color;
    this.particles?.uniforms.color.value.set(color);
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
        if (key.startsWith("glyph")) {
          return { object: this._glyphSettings, property: key, onChange: () => this._syncParticles() };
        }
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
        if (key === "flowEnabled") {
          return {
            object: this,
            property: "flowEnabled",
            onChange: (value) => {
              this.walls.uniforms.flowEnabled.value = value ? 1 : 0;
              if (!value) this.flow.reset();
            },
          };
        }
        if (key === "flowResolution") {
          return {
            object: this,
            property: "flowResolution",
            onChange: (value) => this.flow.setResolution(
              Number(value) * FLOW_ATLAS_COLS,
              Number(value) * FLOW_ATLAS_ROWS,
            ),
          };
        }
        if (key === "flowVelocityScale") return { object: this, property: key };
        const flowControls = {
          flowRadius: "radius",
          flowFade: "fade",
          flowDiffusion: "diffusion",
          flowAdvection: "advection",
        };
        if (flowControls[key]) return { uniform: this.flow.controls[flowControls[key]] };
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

  _updatePointer(camera, delta) {
    if (!this.projector.consumeMovement()) {
      this.flow.setPointer(null);
      return;
    }
    const ray = this.projector.rayFrom(camera);
    const liftedPick = this.hover.value < 0
      ? null
      : this.walls.instanceAt(
        ray,
        this._liftedPick,
        this.walls.uniforms.highlightLift.value +
          this.walls.uniforms.flowEnabled.value * this.walls.uniforms.flowLift.value,
      );
    const pick = liftedPick?.id === this.hover.value
      ? liftedPick
      : this.walls.instanceAt(ray, this._pick);
    if (!pick) {
      this.stroke.end();
      this.flow.setPointer(null);
      this._pickSurface = -1;
      if (this.hover.set(-1)) this.walls.setHovered(-1);
      return;
    }

    this.stroke.update(pick.point, delta, 0, NOOP);
    this._atlas.set(
      ((pick.surface % FLOW_ATLAS_COLS) + pick.u) / FLOW_ATLAS_COLS,
      (Math.floor(pick.surface / FLOW_ATLAS_COLS) + pick.v) / FLOW_ATLAS_ROWS,
    );
    if (pick.surface === this._pickSurface && delta > 0) {
      this._rawVelocity.subVectors(this._atlas, this._prevAtlas)
        .multiplyScalar(this.flowVelocityScale / delta);
      this._velocity.lerp(this._rawVelocity, dampFactor(0.5, delta));
    } else {
      this._velocity.set(0, 0);
    }
    this._prevAtlas.copy(this._atlas);
    this._pickSurface = pick.surface;
    this.flow.setPointer(this._atlas, this._velocity);

    if (this.hover.set(pick.id)) {
      this.walls.setHovered(pick.id);
      audio.trigger("cube", {
        type: "cubeHover",
        id: pick.id,
        intensity: this.stroke.intensity,
      });
    }
  }

  setInteractionEnabled(enabled) {
    if (this.interactionEnabled === enabled) return;
    this.interactionEnabled = enabled;
    if (enabled) {
      this.projector.consumeMovement();
      return;
    }
    this.projector.consumeMovement();
    this.stroke.end();
    this.flow.setPointer(null);
    this._pickSurface = -1;
    if (this.hover.set(-1)) this.walls?.setHovered(-1);
  }

  renderBeforeScene(renderer, camera) {
    if (!this.walls || !camera) return;
    if (this.interactionEnabled) this._updatePointer(camera, this._delta);
    else {
      this.projector.consumeMovement();
      this.flow.setPointer(null);
    }
    if (!this.flowEnabled) return;
    this.flow.render(renderer, this._time, this._delta);
    this.walls.setFlowTexture(this.flow.texture);
  }

  update(time, delta) {
    this.particles?.update(delta);
    if (!this.walls) return;

    this._time = time * 0.001;
    this._delta = delta;
    this.walls.update(this._time, delta);

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
    this._disposed = true;
    this.particles?.dispose();
    this._glyphAppearance?.dispose();
    this._glyphAppearance = null;
    this.particles = null;
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
    this.flow?.dispose();
    this.flow = null;
  }
}
