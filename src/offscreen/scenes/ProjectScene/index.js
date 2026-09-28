import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import SkySphereScene from "../SkySphereScene.js";
import { params } from "@/offscreen/params";
import { timings } from "@/shared/timings";
import { timingEase } from "../../lib/customEases.js";
import { createVortexSkyMaterial } from "./vortexSky.js";
import { createVortexRibbons } from "./vortexRibbons.js";
import { ParticleRibbons } from "../../particles/ParticleRibbons.js";

const COLOR_KEYS = ["deepColor", "cloudDark", "cloudLight", "glowColor", "scanColor"];
const SCALAR_KEYS = [
  "glowStrength", "glowFalloff", "edgeDarken", "centerX", "centerY", "twist", "cloudScale", "streak", "coverage",
  "softness", "cloudOpacity", "fogDensity", "lightOffset", "lightGain",
  "scrollDepth", "flowSpeed", "spinSpeed", "warpSpeed", "warpSpin",
  "scanEnabled", "scanIntensity", "scanCloudGlow", "scanInterval", "scanBurst", "scanDuration", "scanFar", "scanNear",
  "scanTrail", "scanCells", "scanMarkers", "scanGlitch", "scanGlitchRate",
];
// params.js `ribbon*` leaves, split into lifecycle settings and path controls
const RIBBON_SETTINGS = [
  "enabled", "count", "lifetime", "lifetimeVariation", "delay", "fadeIn", "fadeOut", "opacity", "color", "width",
];
const RIBBON_CONTROLS = ["length", "near", "far", "slide", "wobble", "follow"];
const ribbonParam = key => `ribbon${key[0].toUpperCase()}${key.slice(1)}`;
const ribbonKey = param => param[6].toLowerCase() + param.slice(7);

/**
 * Destination scene when a project tile is clicked (routes to
 * /project/[slug]). Not part of the auto-cycling sequence — the
 * TransitionManager pins it until the project is closed.
 *
 * Backdrop is a cloud vortex (vortexSky.js) that warps in on entry and gets
 * pulled back into its core on exit; the persistent screen floats in front.
 */
export default class ProjectScene extends SkySphereScene {
  constructor(config = {}) {
    super(config, { name: "ProjectScene", paramGroup: params.ProjectScene });
    this._reveal = { value: 0, from: 0, to: 0, elapsed: 0, duration: 0, ease: null, switchIn: false };
    this._travel = 0;
    this._spin = 0;
    this._scan = { wait: 0, elapsed: -1, pending: 0 };
  }

  _setupSky() {
    const v = this._values;
    const u = this.uniforms;
    for (const key of COLOR_KEYS) u[key] = uniform(new THREE.Color(v[key]));
    for (const key of SCALAR_KEYS) u[key] = uniform(v[key]);
    u.travel = uniform(0);
    u.spin = uniform(0);
    u.reveal = uniform(0);
    u.scanDepth = uniform(v.scanFar);
    u.scanStrength = uniform(0);
    u.scanSeed = uniform(0);
    u.scanTick = uniform(0);

    const { position, lookAt } = this.cameraState;
    const forward = new THREE.Vector3().subVectors(lookAt, position).normalize();
    const right = new THREE.Vector3().crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();
    u.axisForward = uniform(forward);
    u.axisRight = uniform(right);
    u.axisUp = uniform(new THREE.Vector3().crossVectors(right, forward));

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 48, 32),
      createVortexSkyMaterial(u, `${this.name}Sky`),
    );
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this._setupRibbons();
  }

  _setupRibbons() {
    const v = this._values;
    const pick = keys => Object.fromEntries(keys.map(key => [key, v[ribbonParam(key)]]));
    const { path, appearance, controls } = createVortexRibbons(this.uniforms, pick(RIBBON_CONTROLS));
    this._ribbonControls = controls;
    this.ribbons = new ParticleRibbons({
      path, appearance, settings: pick(RIBBON_SETTINGS), maxCount: 160, segments: 48,
    });
    this.ribbons.name = "Vortex ribbons";
    this.scene.add(this.ribbons);
  }

  renderBeforeScene(renderer, camera, { width, height }) {
    if (width === this._ribbonWidth && height === this._ribbonHeight) return;
    this._ribbonWidth = width;
    this._ribbonHeight = height;
    this.ribbons.resize(width, height);
  }

  _resolveDebugTarget(key, sceneManager) {
    if (key.startsWith("ribbon")) {
      const name = ribbonKey(key);
      if (RIBBON_SETTINGS.includes(name))
        return { object: this.ribbons.settings, property: name, onChange: () => this.ribbons.configure() };
      if (this._ribbonControls[name]) return { uniform: this._ribbonControls[name] };
    }
    return super._resolveDebugTarget(key, sceneManager);
  }

  startReveal({ immediate = false, delay = 0 } = {}) {
    const { inDuration, inEase, pulseAt } = timings.projectSky;
    this._reveal.value = 0;
    this._reveal.switchIn = false;
    this._animateReveal(1, immediate ? 0 : inDuration, inEase, immediate ? 0 : delay);
    this._schedulePulse(immediate ? 0.6 : delay + inDuration * pulseAt);
  }

  /** Project to project: out to black, then straight back in with a pulse. */
  switchReveal({ immediate = false } = {}) {
    if (immediate) return this.startReveal({ immediate });
    const { switchOutDuration, switchOutEase } = timings.projectSky;
    this._animateReveal(0, switchOutDuration, switchOutEase, 0);
    this._reveal.switchIn = true;
    this._schedulePulse(switchOutDuration);
  }

  hideReveal({ immediate = false } = {}) {
    const { outDuration, outEase } = timings.projectSky;
    this._reveal.switchIn = false;
    this._scan.pending = 0;
    this._animateReveal(0, immediate ? 0 : outDuration, outEase, 0);
  }

  /** The backdrop always leads: the gallery enters once its in animation is underway. */
  get galleryReleased() {
    const reveal = this._reveal;
    return reveal.to === 1 && (reveal.value === 1 || reveal.elapsed >= timings.projectSky.galleryDelay);
  }

  _schedulePulse(wait) {
    this._scan.pending = Math.max(wait, 1e-3);
    this._scan.wait = Infinity;
  }

  _animateReveal(to, duration, ease, delay) {
    const reveal = this._reveal;
    reveal.from = reveal.value;
    reveal.to = to;
    reveal.elapsed = -delay;
    reveal.duration = duration;
    reveal.ease = timingEase(ease);
    if (!duration && !delay) {
      reveal.value = to;
      this.uniforms.reveal.value = to;
    }
  }

  update(time, delta) {
    const dt = delta || 1 / 60;
    const u = this.uniforms;
    const reveal = this._reveal;

    if (reveal.value !== reveal.to) {
      reveal.elapsed += dt;
      if (reveal.elapsed >= 0) {
        const t = reveal.duration ? Math.min(1, reveal.elapsed / reveal.duration) : 1;
        reveal.value = t === 1 ? reveal.to : reveal.from + (reveal.to - reveal.from) * reveal.ease(t);
      }
    }
    if (reveal.switchIn && reveal.value === 0) {
      reveal.switchIn = false;
      const { switchInDuration, inEase } = timings.projectSky;
      this._animateReveal(1, switchInDuration, inEase, reveal.duration - reveal.elapsed);
    }

    // Unrevealed = warping: clouds rush out of the core and spin faster
    const warp = (1 - reveal.value) ** 2;
    this._travel += dt * (u.flowSpeed.value + warp * u.warpSpeed.value);
    this._spin += dt * (u.spinSpeed.value + warp * u.warpSpin.value);
    u.travel.value = this._travel;
    u.spin.value = this._spin;
    u.reveal.value = reveal.value;
    this._updateScan(time, dt);

    // Ribbon age advances in cloud-travel time so ribbons keep pace with the
    // streaks they ride, including the warp
    const flow = Math.max(u.flowSpeed.value, 1e-3);
    this.ribbons.update(dt * (flow + warp * u.warpSpeed.value) / flow);
  }

  _updateScan(time, dt) {
    const u = this.uniforms;
    const scan = this._scan;
    u.scanTick.value = Math.floor(time * 0.001 * u.scanGlitchRate.value);

    if (scan.pending > 0) {
      scan.pending -= dt;
      if (scan.pending <= 0 && u.scanEnabled.value) this._startPulse();
    }

    if (scan.elapsed < 0) {
      u.scanStrength.value = 0;
      scan.wait -= dt;
      if (scan.wait > 0 || !u.scanEnabled.value || this._reveal.to < 1) return;
      this._startPulse();
    }

    scan.elapsed += dt;
    const t = scan.elapsed / Math.max(u.scanDuration.value, 0.1);
    if (t >= 1) {
      scan.elapsed = -1;
      scan.wait = scan.pending > 0 ? Infinity : Math.random() < u.scanBurst.value
        ? 0.25 + Math.random() * 0.3
        : u.scanInterval.value * (0.6 + Math.random() * 0.8);
      u.scanStrength.value = 0;
      return;
    }
    // Exponential approach: constant speed in log depth, so it accelerates on screen
    const far = u.scanFar.value;
    u.scanDepth.value = far * Math.pow(u.scanNear.value / far, t);
    const fadeIn = Math.min(1, t / 0.12);
    const fadeOut = Math.min(1, (1 - t) / 0.3);
    u.scanStrength.value = fadeIn * fadeIn * fadeOut;
  }

  _startPulse() {
    this._scan.elapsed = 0;
    this.uniforms.scanSeed.value = Math.floor(Math.random() * 32);
  }

  dispose() {
    this.ribbons?.dispose();
    this.ribbons = null;
    super.dispose();
  }
}
