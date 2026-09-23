import * as THREE from "three/webgpu";
import {
  Fn,
  attribute,
  float,
  mix,
  mx_noise_float,
  positionWorld,
  sin,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import { BatchedMSDFText } from "three-blocks/msdf-text";
import SkySphereScene from "../SkySphereScene.js";
import { createVignette } from "@/offscreen/postprocessing/vignette.js";
import { loadMSDFFont } from "@/offscreen/utils/msdfFont";
import { params } from "@/offscreen/params";
import ParticlePortrait from "./ParticlePortrait.js";

const WORDS = [
  "CREATIVE DEVELOPER",
  "WEBGPU",
  "THREEJS",
  "TSL",
  "REALTIME",
  "SHADERS",
  "MOTION",
  "INTERACTION",
  "TYPOGRAPHY",
  "DESIGN",
  "COMPUTE",
  "PARTICLES",
  "WEBGL",
  "FREELANCE",
  "PORTFOLIO",
  "EXPERIMENTS",
  "GPU",
  "RENDER",
  "PIXELS",
  "GEOMETRY",
  "LIGHT",
  "DEPTH",
  "SPACE",
  "FORM",
  "RHYTHM",
  "SIGNAL",
  "GLYPH",
  "KERNING",
  "ATLAS",
  "VECTOR",
  "SHADER",
  "TYPE",
  "BUFFER",
  "PIXEL",
  "GRID",
  "WEIGHT",
  "FRAME",
  "BATCH",
  "QUAD",
  "SDF",
  "CRISP",
  "LAYOUT",
  "STORAGE",
  "LETTER",
  "BASELINE",
  "ANCHOR",
  "INSTANCE",
  "OFFSET",
  "FIELD",
  "VOLUME",
  "TEXTURE",
  "MESH",
  "VERTEX",
  "RAYMARCH",
  "SURFACE",
  "CACHE",
  "PIPELINE",
];

function random01(index, salt) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Destination scene for /about. Same pinned flow and SkySphereScene backdrop
 * as ProjectScene, but instead of the persistent screen it renders a slowly
 * drifting cloud of small, thin words in several depth layers — one
 * BatchedMSDFText draw call, with farther layers darker and fainter (port of
 * the three-blocks batched-MSDF kinetic-type wall, minus the fluid/HTML
 * dressing). Look and motion live in params.AboutScene.Wall.
 */
export default class AboutScene extends SkySphereScene {
  constructor(config = {}) {
    super(config, { name: "AboutScene", paramGroup: params.AboutScene });

    this._batch = null;
    this._members = [];
    this._matrix = new THREE.Matrix4();
    this._scrollTime = 0;
    this._shimmerTime = 0;
    this._reveal = { progress: 1 };
    this._wallColor = new THREE.Color(this._values.wallColor);
    this._wallDarkColor = new THREE.Color(this._values.skyBottom);
    this._tmpColor = new THREE.Color();
    this._portrait = new ParticlePortrait(this.scene, this._values, this.cameraState);

    this._vignette = createVignette({
      strength: this._values.vignetteStrength,
      radius: this._values.vignetteRadius,
      smoothness: this._values.vignetteSmoothness,
    });
    this.postprocessingChain = [this._vignette];

    this._shimmer = {
      time: uniform(0),
      amount: uniform(this._values.wallShimmerAmount),
      lift: uniform(this._values.wallShimmerLift),
      scale: uniform(this._values.wallShimmerScale),
      letterPhase: uniform(this._values.wallShimmerLetterPhase),
    };

    loadMSDFFont().then(({ font, map }) => this._buildWall(font, map));
  }

  /**
   * Restart the fade-in. Called by Site when the about page opens;
   * `immediate` (deep link) skips it.
   */
  startReveal({ immediate = false } = {}) {
    this._reveal.progress = immediate ? 1 : 0;
  }

  _buildWall(font, map) {
    const v = this._values;
    const layerCount = Math.max(1, v.wallLayers);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.cameraState.fov / 2));
    const camZ = this.cameraState.position.z;
    const rowHeight = v.wallFontSize * v.wallRowSpacing;
    const cell = v.wallFontSize * v.wallWordCell;

    // Back-to-front so the single draw call blends far layers first
    const layers = [];
    for (let li = layerCount - 1; li >= 0; li--) {
      const z = v.wallZ - li * v.wallLayerGap;
      const dist = camZ - z;
      const halfH = dist * tanHalf;
      const span = halfH * v.wallAspect * 2 + cell;
      layers.push({
        li,
        z,
        halfH,
        span,
        rows: Math.max(3, Math.floor((halfH * 2) / rowHeight)),
        perRow: Math.ceil(span / cell),
      });
    }

    let total = 0;
    for (const layer of layers) total += layer.rows * layer.perRow;

    this._batch = new BatchedMSDFText({
      font,
      map,
      maxTextCount: total,
      maxGlyphCount: total * 12,
    });
    this._batch.frustumCulled = false;
    this._batch.opacity = 0;
    this._batch.weightBias = v.wallWeight;
    this._installShimmerMaterial();

    for (const layer of layers) {
      const layerT = layerCount === 1 ? 0 : layer.li / (layerCount - 1);
      const color = this._layerColor(layerT);
      const opacity = this._layerOpacity(layerT);
      const stepY = (layer.halfH * 2) / layer.rows;

      for (let row = 0; row < layer.rows; row++) {
        const rowY = -layer.halfH + (row + 0.5) * stepY;
        const speedFactor = 0.55 + random01(row + layer.li * 31, 3) * 0.9;

        for (let w = 0; w < layer.perRow; w++) {
          const seed = row * 53 + w * 7 + layer.li * 131;
          const word = WORDS[(row * 7 + w * 3 + layer.li * 11) % WORDS.length];
          const y0 =
            rowY + (random01(seed, 17) - 0.5) * stepY * v.wallJitterY;
          const id = this._batch.addText({
            text: word,
            position: { x: 0, y: y0, z: layer.z },
            fontSize: v.wallFontSize,
            letterSpacing: v.wallFontSize * v.wallLetterSpacing,
            anchorX: "center",
            anchorY: "middle",
            color,
            opacity,
          });
          if (id === -1) continue;

          this._members.push({
            id,
            layerT,
            x0: (w + random01(seed, 7) * 0.5) * cell,
            y0,
            z: layer.z,
            speedFactor,
            span: layer.span,
            wrapStart: -layer.span / 2,
            phase1: random01(seed, 29) * Math.PI * 2,
            phase2: random01(seed, 43) * Math.PI * 2,
            freq1: 0.6 + random01(seed, 61) * 0.8,
            freq2: 1.3 + random01(seed, 71) * 1.1,
          });
        }
      }
    }

    this.scene.add(this._batch);
  }

  /**
   * Port of the example's wall-wave alpha: two traveling sine waves warped
   * by drifting noise fade each letter in and out smoothly. World-space
   * position (which includes the per-member transform) gives the wave a
   * position across the wall; the per-glyph `msdfLetter` index staggers the
   * phase letter by letter within a word.
   */
  _installShimmerMaterial() {
    const material = this._batch.material;
    const baseColor = material.colorNode;
    if (!baseColor) return;

    const u = this._shimmer;

    material.colorNode = Fn(() => {
      const base = vec4(baseColor).toVar();
      const p = positionWorld.xy.mul(u.scale).toVar();
      const t = u.time;
      const letter = attribute("msdfLetter", "float").mul(u.letterPhase);

      const warp = mx_noise_float(vec3(p.mul(0.5), t.mul(0.3))).toVar();
      const diagonal = sin(
        p.x.mul(1.3)
          .add(p.y.mul(0.8))
          .sub(t)
          .add(warp.mul(2.0))
          .add(letter),
      );
      const cross = sin(
        p.x.mul(-0.6)
          .add(p.y.mul(1.7))
          .add(t.mul(0.63))
          .add(warp.mul(3.0))
          .sub(letter.mul(0.7)),
      );
      const waves = diagonal.mul(0.6).add(cross.mul(0.4)).mul(0.5).add(0.5);
      const soft = smoothstep(0.12, 0.88, waves);
      const factor = mix(
        float(1.0).sub(u.amount),
        float(1.0).add(u.lift),
        soft,
      );

      return vec4(base.rgb, base.a.mul(factor).saturate());
    })();
    material.needsUpdate = true;
  }

  _layerColor(layerT) {
    return this._tmpColor
      .copy(this._wallColor)
      .lerp(this._wallDarkColor, layerT * this._values.wallDepthFade)
      .getHex();
  }

  _layerOpacity(layerT) {
    const v = this._values;
    return v.wallLayerOpacity * (1 - layerT * v.wallDepthOpacityFade);
  }

  _applyWallColors() {
    if (!this._batch) return;
    for (const member of this._members) {
      this._batch.setColorAt(member.id, this._layerColor(member.layerT));
    }
  }

  _applyWallOpacities() {
    if (!this._batch) return;
    for (const member of this._members) {
      this._batch.setOpacityAt(member.id, this._layerOpacity(member.layerT));
    }
  }

  _applyWallType() {
    if (!this._batch) return;
    const v = this._values;
    this._batch.weightBias = v.wallWeight;
    for (const member of this._members) {
      this._batch.setLayoutAt(member.id, {
        fontSize: v.wallFontSize,
        letterSpacing: v.wallFontSize * v.wallLetterSpacing,
      });
    }
  }

  update(time, delta) {
    const v = this._values;
    const dt = delta || 1 / 60;
    this._scrollTime += dt;
    this._shimmerTime += dt * v.wallShimmerSpeed;
    if (this._shimmer) this._shimmer.time.value = this._shimmerTime;

    const reveal = this._reveal;
    if (reveal.progress < 1) {
      reveal.progress = Math.min(
        1,
        reveal.progress + dt / Math.max(v.wallRevealDuration, 1e-3),
      );
    }
    const p = reveal.progress;
    this._portrait.update(dt, p * p * (3 - 2 * p));
    if (!this._batch) return;
    this._batch.opacity = v.wallOpacity * (p * p * (3 - 2 * p));

    const t = this._scrollTime;
    const swayT = t * v.wallSwaySpeed * Math.PI * 2;
    const sway = v.wallSwayAmount;

    for (const member of this._members) {
      const drift = t * v.wallSpeed * member.speedFactor;
      const x =
        member.wrapStart +
        THREE.MathUtils.euclideanModulo(
          member.x0 - member.wrapStart + drift,
          member.span,
        ) +
        Math.cos(swayT * member.freq2 + member.phase1) * sway * 0.4;
      const y =
        member.y0 +
        Math.sin(swayT * member.freq1 + member.phase1) * sway * 0.7 +
        Math.sin(swayT * member.freq2 + member.phase2) * sway * 0.3;

      this._batch.setMatrixAt(
        member.id,
        this._matrix.makeTranslation(x, y, member.z),
      );
    }
  }

  _resolveDebugTarget(key) {
    const portraitTarget = this._portrait.resolveDebugTarget(key);
    if (portraitTarget) return portraitTarget;
    if (key === "wallColor") {
      return {
        object: this,
        property: "_wallColor",
        onChange: () => this._applyWallColors(),
      };
    }
    if (key === "wallDepthFade") {
      return {
        object: this._values,
        property: key,
        onChange: () => this._applyWallColors(),
      };
    }
    if (key === "wallLayerOpacity" || key === "wallDepthOpacityFade") {
      return {
        object: this._values,
        property: key,
        onChange: () => this._applyWallOpacities(),
      };
    }
    if (
      key === "wallFontSize" ||
      key === "wallLetterSpacing" ||
      key === "wallWeight"
    ) {
      return {
        object: this._values,
        property: key,
        onChange: () => this._applyWallType(),
      };
    }
    if (
      key === "wallSpeed" ||
      key === "wallSwayAmount" ||
      key === "wallSwaySpeed" ||
      key === "wallOpacity" ||
      key === "wallShimmerSpeed"
    ) {
      return { object: this._values, property: key };
    }
    const shimmerMap = {
      wallShimmerAmount: "amount",
      wallShimmerLift: "lift",
      wallShimmerScale: "scale",
      wallShimmerLetterPhase: "letterPhase",
    };
    if (shimmerMap[key]) {
      return { uniform: this._shimmer[shimmerMap[key]] };
    }
    const vignetteMap = {
      vignetteStrength: "strength",
      vignetteRadius: "radius",
      vignetteSmoothness: "smoothness",
    };
    if (vignetteMap[key]) {
      return { uniform: this._vignette.uniforms[vignetteMap[key]] };
    }
    return super._resolveDebugTarget(key);
  }

  dispose() {
    this._portrait.dispose();
    if (this._batch) {
      this.scene.remove(this._batch);
      this._batch.geometry.dispose();
      this._batch.material.dispose();
      this._batch = null;
    }
    this._members.length = 0;
    super.dispose();
  }
}
