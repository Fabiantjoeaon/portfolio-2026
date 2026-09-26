import {
  Color,
  HalfFloatType,
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
import { createRenderTarget } from "../utils/renderTarget.js";

const offscreenPointer = new Vector2(-10, -10);

/**
 * Low-resolution ping-pong texture painted by a pointer brush.
 *
 * - `intensity` mode: R = trail, eroded/diffused and faded (ice frost).
 * - `flow` mode: RG = velocity (uv / s), B = intensity. The field advects
 *   along its own velocity so drags leave a wake that keeps travelling.
 *
 * `brushScale` corrects atlas cells so the brush stays circular per surface.
 */
export class PointerFeedbackMap {
  constructor({
    width,
    height,
    mode = "intensity",
    radius = 0.03,
    fade = 0.5,
    diffusion = 0.5,
    noise = 0,
    advection = 1,
    brushScale = new Vector2(1, 1),
  }) {
    this.mode = mode;
    this.width = width;
    this.height = height;
    this._needsClear = true;
    this._clearColor = new Color();

    this.controls = {
      pointer: uniform(offscreenPointer.clone()),
      pointerActive: uniform(0),
      velocity: uniform(new Vector2()),
      brushScale: uniform(brushScale.clone()),
      clock: uniform(0),
      delta: uniform(0),
      radius: uniform(radius),
      fade: uniform(fade),
      diffusion: uniform(diffusion),
      noise: uniform(noise),
      advection: uniform(advection),
      resolution: uniform(new Vector2(width, height)),
    };

    this._targets = [this._createTarget(), this._createTarget()];
    this._input = this._targets[0];
    this._output = this._targets[1];
    this._feedback = texture(this._input.texture);

    const material = new MeshBasicNodeMaterial();
    material.depthTest = false;
    material.depthWrite = false;
    material.fragmentNode =
      mode === "flow" ? this._flowNode() : this._intensityNode();
    this._quad = new QuadMesh(material);
  }

  _createTarget() {
    return createRenderTarget(this.width, this.height, {
      samples: 0,
      depthBuffer: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      ...(this.mode === "flow" ? { type: HalfFloatType } : {}),
    });
  }

  _brush(st) {
    const u = this.controls;
    const noiseA = mx_noise_float(vec3(st.mul(15), u.clock.mul(0.12)))
      .mul(2).sub(1).mul(u.noise);
    const noiseB = mx_noise_float(vec3(st.mul(31).add(100), u.clock.mul(0.17)))
      .mul(2).sub(1).mul(u.noise.mul(0.65));
    const distance = st.sub(u.pointer).div(u.brushScale).length()
      .add(noiseA).add(noiseB);
    return smoothstep(u.radius, u.radius.mul(0.35), distance).mul(u.pointerActive);
  }

  _intensityNode() {
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
      const trail = decayed.max(this._brush(st)).clamp(0, 1);
      return vec4(vec3(trail), 1);
    })();
  }

  _flowNode() {
    const u = this.controls;
    return Fn(() => {
      const st = uv();
      const texel = vec2(1).div(u.resolution);
      const current = this._feedback.sample(st);
      const advected = this._feedback.sample(
        st.sub(current.xy.mul(u.advection).mul(u.delta)),
      );
      const average = this._feedback.sample(st.add(texel))
        .add(this._feedback.sample(st.sub(texel)))
        .add(this._feedback.sample(st.add(vec2(texel.x.negate(), texel.y))))
        .add(this._feedback.sample(st.add(vec2(texel.x, texel.y.negate()))))
        .mul(0.25);
      const blurred = mix(advected, average, u.diffusion.mul(0.5));
      const decay = float(1).sub(u.delta.mul(u.fade)).max(0);
      const brush = this._brush(st);
      const velocity = mix(blurred.xy.mul(decay), u.velocity, brush);
      const intensity = blurred.z.mul(decay).max(brush).clamp(0, 1);
      return vec4(velocity, intensity, 1);
    })();
  }

  get texture() {
    return this._input.texture;
  }

  /** Pointer position in map uv, or null to lift the brush. */
  setPointer(uvPoint, velocity = null) {
    const u = this.controls;
    if (!uvPoint) {
      u.pointerActive.value = 0;
      return;
    }
    u.pointer.value.copy(uvPoint);
    if (velocity) u.velocity.value.copy(velocity);
    u.pointerActive.value = 1;
  }

  setResolution(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.controls.resolution.value.set(width, height);
    for (const target of this._targets) target.setSize(width, height);
    this._needsClear = true;
  }

  reset() {
    this.controls.pointerActive.value = 0;
    this._needsClear = true;
  }

  _clear(renderer) {
    const target = renderer.getRenderTarget();
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this._clearColor);
    try {
      renderer.setClearColor(0x000000, 1);
      for (const feedbackTarget of this._targets) {
        renderer.setRenderTarget(feedbackTarget);
        renderer.clear();
      }
    } finally {
      renderer.setRenderTarget(target);
      renderer.setClearColor(this._clearColor, alpha);
    }
    this._needsClear = false;
  }

  /**
   * @param {number} time - Seconds
   * @param {number} delta - Seconds since the previous step
   */
  render(renderer, time, delta) {
    if (this._needsClear) this._clear(renderer);
    this.controls.clock.value = time;
    this.controls.delta.value = Math.min(delta, 0.1);

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
  }

  dispose() {
    for (const target of this._targets) target.dispose();
    this._quad.material.dispose();
  }
}
