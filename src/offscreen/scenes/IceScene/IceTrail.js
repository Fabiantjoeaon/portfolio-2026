import {
  Color,
  LinearFilter,
  MeshBasicNodeMaterial,
  QuadMesh,
  Vector2,
} from "three/webgpu";
import {
  Fn,
  float,
  min,
  mix,
  mx_noise_float,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { PointerRaycaster } from "../../input/PointerRaycaster.js";
import { createRenderTarget } from "../../utils/renderTarget.js";

const offscreenPointer = new Vector2(-10, -10);
export const TRAIL_ATLAS_SCALE_X = 0.46;
export const TRAIL_GROUND_OFFSET_X = 0.01;
export const TRAIL_WALL_OFFSET_X = 0.53;

/**
 * Low-resolution feedback texture painted by the shared mouse raycaster.
 * This is the WebGPU/TSL equivalent of the supplied ice-trails ping-pong pass.
 */
export class IceTrail {
  constructor(settings) {
    this.enabled = settings.trailEnabled;
    this.resolution = settings.trailResolution;
    this.updateInterval = settings.trailUpdateInterval;
    this.projector = new PointerRaycaster();
    this._pointerTarget = new Vector2();
    this._surface = null;
    this._frame = 0;
    this._elapsed = 0;
    this._needsClear = true;
    this._hasPointer = false;
    this._clearColor = new Color();

    this.controls = {
      pointer: uniform(offscreenPointer.clone()),
      pointerActive: uniform(0),
      clock: uniform(0),
      delta: uniform(0),
      radius: uniform(settings.trailRadius),
      fade: uniform(settings.trailFade),
      diffusion: uniform(settings.trailDiffusion),
      noise: uniform(settings.trailNoise),
      resolution: uniform(new Vector2(this.resolution * 2, this.resolution)),
    };

    this._targets = [this._createTarget(), this._createTarget()];
    this._input = this._targets[0];
    this._output = this._targets[1];
    this._feedback = texture(this._input.texture);

    const material = new MeshBasicNodeMaterial();
    material.depthTest = false;
    material.depthWrite = false;
    material.fragmentNode = this._feedbackNode();
    this._quad = new QuadMesh(material);
  }

  _createTarget() {
    return createRenderTarget(this.resolution * 2, this.resolution, {
      samples: 0,
      depthBuffer: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
  }

  _feedbackNode() {
    const u = this.controls;
    return Fn(() => {
      const st = uv();
      const texel = vec2(1).div(u.resolution).mul(0.75);
      const center = this._feedback.sample(st).r;
      const a = this._feedback.sample(st.add(texel)).r;
      const b = this._feedback.sample(st.sub(texel)).r;
      const c = this._feedback.sample(st.add(vec2(texel.x.negate(), texel.y))).r;
      const d = this._feedback.sample(st.add(vec2(texel.x, texel.y.negate()))).r;
      const average = a.add(b).add(c).add(d).mul(0.25);
      const lowest = min(min(a, b), min(c, d));
      const spread = mix(lowest, average, u.diffusion);
      const softened = center.greaterThan(average).select(average, spread);
      const decayed = softened.mul(float(1).sub(u.delta.mul(u.fade)).max(0));

      const noiseA = mx_noise_float(vec3(st.mul(15), u.clock.mul(0.12)))
        .mul(2).sub(1).mul(u.noise);
      const noiseB = mx_noise_float(vec3(st.mul(31).add(100), u.clock.mul(0.17)))
        .mul(2).sub(1).mul(u.noise.mul(0.65));
      // Each surface occupies half of a 2:1 atlas. Correct X before measuring
      // the brush so its footprint remains circular in the surface UVs.
      const distance = vec2(st.x.sub(u.pointer.x).div(TRAIL_ATLAS_SCALE_X),
        st.y.sub(u.pointer.y)).length().add(noiseA).add(noiseB);
      const brush = smoothstep(u.radius, u.radius.mul(0.35), distance)
        .mul(u.pointerActive);
      const trail = decayed.max(brush).clamp(0, 1);
      return vec4(vec3(trail), 1);
    })();
  }

  get texture() {
    return this._input.texture;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.controls.pointerActive.value = 0;
      this._needsClear = true;
      this._hasPointer = false;
      this._surface = null;
    }
  }

  setResolution(resolution) {
    const next = Math.max(64, Math.round(resolution));
    this.resolution = next;
    if (next * 2 === this._targets[0].width) return;
    this.controls.resolution.value.set(next * 2, next);
    for (const target of this._targets) target.setSize(next * 2, next);
    this._needsClear = true;
  }

  _clear(renderer) {
    const target = renderer.getRenderTarget();
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this._clearColor);
    try {
      renderer.setClearColor(0x000000, 1);
      for (const trailTarget of this._targets) {
        renderer.setRenderTarget(trailTarget);
        renderer.clear();
      }
    } finally {
      renderer.setRenderTarget(target);
      renderer.setClearColor(this._clearColor, alpha);
    }
    this._needsClear = false;
  }

  _updatePointer(camera, ground, cave, delta) {
    const moved = this.projector.consumeMovement();
    if (!moved) {
      this.controls.pointerActive.value = 0;
      return;
    }

    const intersections = this.projector.intersectObjects(
      camera,
      [ground, cave].filter(Boolean),
    );
    let surface = null;
    let surfaceUv = null;
    for (const hit of intersections) {
      if (hit.object === ground && hit.uv) {
        surface = "ground";
        surfaceUv = this._pointerTarget.copy(hit.uv);
        break;
      }
      const wallUv = cave?.trailUvFromIntersection(hit, this._pointerTarget);
      if (wallUv) {
        surface = "wall";
        surfaceUv = wallUv;
        break;
      }
    }
    if (!surfaceUv) {
      this.controls.pointerActive.value = 0;
      this._hasPointer = false;
      this._surface = null;
      return;
    }

    const offset = surface === "ground"
      ? TRAIL_GROUND_OFFSET_X
      : TRAIL_WALL_OFFSET_X;
    const x = offset + surfaceUv.x * TRAIL_ATLAS_SCALE_X;
    const y = surfaceUv.y;
    if (!this._hasPointer || surface !== this._surface) {
      this.controls.pointer.value.set(x, y);
      this._hasPointer = true;
    } else {
      const smoothing = 1 - Math.exp(-Math.max(delta, 0) * 16);
      this._pointerTarget.set(x, y);
      this.controls.pointer.value.lerp(this._pointerTarget, smoothing);
    }
    this._surface = surface;
    this.controls.pointerActive.value = 1;
  }

  render(renderer, camera, ground, cave, timeMs, delta) {
    if (!this.enabled) return false;
    this._elapsed += Math.max(delta, 0);
    this._frame++;
    if (this._frame % Math.max(1, Math.round(this.updateInterval)) !== 0)
      return false;

    if (this._needsClear) this._clear(renderer);
    this._updatePointer(camera, ground, cave, this._elapsed);
    this.controls.clock.value = timeMs * 0.001;
    this.controls.delta.value = Math.min(this._elapsed, 0.1);
    this._elapsed = 0;

    const target = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = true;
      renderer.setRenderTarget(this._output);
      this._quad.render(renderer);
    } finally {
      renderer.setRenderTarget(target);
      renderer.autoClear = autoClear;
    }

    [this._input, this._output] = [this._output, this._input];
    this._feedback.value = this._input.texture;
    return true;
  }

  dispose() {
    for (const target of this._targets) target.dispose();
    this._quad.material.dispose();
  }
}
