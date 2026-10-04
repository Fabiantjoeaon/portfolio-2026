import { mobileSettings } from "@/shared/mobileSettings";
import { getFlag } from "@/offscreen/lib/query";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import SkySphereScene from "../SkySphereScene.js";
import { params } from "@/offscreen/params";
import { timings } from "@/shared/timings";
import { timingEase } from "../../lib/customEases.js";
import { createVortexSkyMaterial } from "./vortexSky.js";
import { createVortexRibbons } from "./vortexRibbons.js";
import { ParticleRibbons } from "../../particles/ParticleRibbons.js";
import { getDebugFolder } from "@/offscreen/debug/bindDebugParams";

const SKY_COLORS = {
  deepColor: "Deep",
  cloudShadowColor: "Cloud Shadow",
  cloudLightColor: "Cloud Light",
  coreGlowColor: "Core Glow",
  coreGlowColorScrolled: "Core Glow Scrolled",
};
const COLOR_KEYS = ["scanColor"];
const PALETTE_KEYS = ["deepColor", "cloudDark", "cloudLight", "glowColor"];
const SCALAR_KEYS = [
  "glowStrength", "glowFalloff", "edgeDarken", "centerX", "centerY", "twist", "cloudScale", "streak", "coverage",
  "softness", "cloudOpacity", "fogDensity", "lightOffset", "lightGain",
  "scrollDepth", "headerDim", "headerDimExit", "headerDimDuration", "flowSpeed", "spinSpeed", "warpSpeed", "warpSpin", "revealZoom",
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
    this.cameraState.lockTouchCamera = true;
    this._reveal = { value: 0, from: 0, to: 0, elapsed: 0, duration: 0, ease: null, switchIn: false, switching: false, zoom: 1 };
    this._travel = 0;
    this._spin = 0;
    this._scan = { wait: 0, elapsed: -1, pending: 0 };
    this._headerScroll = 0;
    this._headerDim = 1;
    this._palettePending = false;
    this._glowMix = 0;
    this._glowScrolled = false;
  }

  /** The next project's `sky` colors; applied once the backdrop is black. */
  setPalette(sky) {
    this._palettePending = !!sky;
    if (!sky) return;
    for (const key in SKY_COLORS) {
      this._sky[key] = sky[key];
      this._skyEditors?.[key].setValue(sky[key]);
    }
  }

  _applyPalette() {
    if (!this._palettePending) return;
    this._palettePending = false;
    for (const key in SKY_COLORS) this._skyColors[key].set(this._sky[key]);
    this.setGlowScrolled(false, true);
  }

  // Debug-only: edits apply live (or with the pending palette), reset on the next
  // setPalette, and are never saved
  attachDebug(gui, options) {
    super.attachDebug(gui, options);
    const folder = getDebugFolder(gui, `${this.name}/Vortex Colors`);
    if (!folder || folder._debugBound) return;
    folder._debugBound = true;
    this._skyEditors = Object.fromEntries(Object.entries(SKY_COLORS).map(([key, name]) => [key,
      folder.addColor(this._sky, key).name(name).onChange(() => {
        if (!this._palettePending) this._skyColors[key].set(this._sky[key]);
      }),
    ]));
    const label = "Copy sky colors";
    const control = folder.add({ [label]: () => {
      const lines = Object.keys(SKY_COLORS).map(key => `    ${key}: "${this._sky[key]}",`);
      navigator.clipboard.writeText(`  sky: {\n${lines.join("\n")}\n  },\n`).then(
        () => control.name("Copied"),
        () => control.name("Copy failed"),
      );
      setTimeout(() => control.name(label), 1400);
    } }, label);
  }

  /** Near the page's "Next project" the core glow blends to its scrolled color. */
  setGlowScrolled(active, immediate = false) {
    this._glowScrolled = active;
    if (immediate) this._glowMix = active ? 1 : 0;
    this._updateGlow(0);
  }

  _updateGlow(dt) {
    const target = this._glowScrolled ? 1 : 0;
    const step = dt / Math.max(timings.projectSky.glowScrollDuration, 0.01);
    this._glowMix = target > this._glowMix ? Math.min(target, this._glowMix + step) : Math.max(target, this._glowMix - step);
    const t = this._glowMix;
    this.uniforms.glowColor.value.lerpColors(this._glowInitial, this._glowEnd, t * t * (3 - 2 * t));
  }

  setPageScroll(scroll, viewportHeight = 1) {
    super.setPageScroll(scroll, viewportHeight);
    this._headerScroll = scroll / Math.max(viewportHeight, 1);
  }

  get _inHeader() {
    return this._headerScroll < this.uniforms.headerDimExit.value;
  }

  _updateHeaderDim(dt) {
    const target = this._inHeader ? 1 : 0;
    const step = dt / Math.max(this.uniforms.headerDimDuration.value, 0.01);
    this._headerDim = target > this._headerDim ? Math.min(target, this._headerDim + step) : Math.max(target, this._headerDim - step);
    const t = this._headerDim;
    this.uniforms.dim.value = t * t * (3 - 2 * t);
  }

  _setupSky() {
    const v = this._values;
    const u = this.uniforms;
    for (const key of COLOR_KEYS) u[key] = uniform(new THREE.Color(v[key]));
    for (const key of PALETTE_KEYS) u[key] = uniform(new THREE.Color(0x000000));
    this._glowInitial = new THREE.Color(0x000000);
    this._glowEnd = new THREE.Color(0x000000);
    this._skyColors = {
      deepColor: u.deepColor.value,
      cloudShadowColor: u.cloudDark.value,
      cloudLightColor: u.cloudLight.value,
      coreGlowColor: this._glowInitial,
      coreGlowColorScrolled: this._glowEnd,
    };
    this._sky = Object.fromEntries(Object.keys(SKY_COLORS).map(key => [key, "#000000"]));
    for (const key of SCALAR_KEYS) u[key] = uniform(v[key]);
    u.travel = uniform(0);
    u.spin = uniform(0);
    u.reveal = uniform(0);
    u.zoom = uniform(1);
    u.dim = uniform(1);
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
    const settings = pick(RIBBON_SETTINGS);
    const touch = getFlag('touchExperience');
    if (touch) settings.count = mobileSettings.projectRibbonCount;
    this.ribbons = new ParticleRibbons({
      path, appearance, settings, maxCount: touch ? 256 : 160, segments: 48,
    });
    this.ribbons.name = "Vortex ribbons";
    this.scene.add(this.ribbons);
  }

  renderBeforeScene(renderer, camera, { width, height }) {
    if (getFlag('touchExperience') && this.ribbons.settings.count !== mobileSettings.projectRibbonCount)
      this.ribbons.configure({ count: mobileSettings.projectRibbonCount });
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
    this._applyPalette();
    this._headerDim = this._inHeader ? 1 : 0;
    this._updateHeaderDim(0);
    this._reveal.value = 0;
    this._reveal.switchIn = this._reveal.switching = false;
    this._animateReveal(1, immediate ? 0 : inDuration, inEase, immediate ? 0 : delay);
    this._schedulePulse(immediate ? 0.6 : delay + inDuration * pulseAt);
  }

  /** Project to project: out to black, then straight back in with a pulse. */
  switchReveal({ immediate = false } = {}) {
    if (immediate) return this.startReveal({ immediate });
    const { switchOutDelay, switchOutDuration, switchOutEase } = timings.projectSky;
    this._animateReveal(0, switchOutDuration, switchOutEase, switchOutDelay);
    this._reveal.switchIn = this._reveal.switching = true;
    this._schedulePulse(switchOutDelay + switchOutDuration);
  }

  hideReveal({ immediate = false } = {}) {
    const { outDuration, outEase } = timings.projectSky;
    this._reveal.switchIn = this._reveal.switching = false;
    this._scan.pending = 0;
    this._animateReveal(0, immediate ? 0 : outDuration, outEase, 0);
  }

  /** The backdrop always leads: the gallery enters once its in animation is underway. */
  get galleryReleased() {
    const reveal = this._reveal;
    const { galleryDelay, switchGalleryDelay } = timings.projectSky;
    return reveal.to === 1 && (reveal.value === 1 || reveal.elapsed >= (reveal.switching ? switchGalleryDelay : galleryDelay));
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
    this._updatePageScroll(dt);

    if (reveal.value !== reveal.to) {
      reveal.elapsed += dt;
      if (reveal.elapsed >= 0) {
        const t = reveal.duration ? Math.min(1, reveal.elapsed / reveal.duration) : 1;
        reveal.value = t === 1 ? reveal.to : reveal.from + (reveal.to - reveal.from) * reveal.ease(t);
      }
    }
    if (reveal.switchIn && reveal.value === 0) {
      reveal.switchIn = false;
      this._applyPalette();
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
    // Opening zooms in to rest with the reveal itself; closing keeps the zoom it started from.
    if (reveal.to === 1) reveal.zoom = 1 + (u.revealZoom.value - 1) * (1 - reveal.value);
    u.zoom.value = reveal.zoom;
    this._updateHeaderDim(dt);
    this._updateGlow(dt);
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
