import { AdditiveBlending, Color, Group } from "three/webgpu";
import { Fn, instanceIndex, uniform, vec4 } from "three/tsl";
import { MeshLine } from "makio-meshline";
import { particleLifecycle } from "./lifecycle.js";

const defaults = {
  enabled: true, count: 64, lifetime: 10, lifetimeVariation: 0.3,
  delay: 1, fadeIn: 1.5, fadeOut: 2, opacity: 0.4, color: 0x91aaff,
  speed: 1, width: 1,
};

/** Ribbon counterpart of ParticleSystem: one instanced MeshLine where every
 * instance runs the same stateless lifecycle, so ribbons respawn with fresh
 * random values each cycle and nothing is uploaded per frame.
 * `path({ t, life, uniforms })` returns the world position at `t` (0..1 along
 * the ribbon). `appearance` receives the same inputs and may return
 * color / opacity / width nodes; both run per vertex. Width is in CSS pixels.
 */
export class ParticleRibbons extends Group {
  constructor({ settings = {}, path, appearance, maxCount = 128, segments = 48 } = {}) {
    super();
    this.name = "Particle ribbons";
    this.maxCount = Math.max(1, Math.floor(maxCount));
    this.settings = { ...defaults };
    this.uniforms = {};
    for (const [key, value] of Object.entries(defaults)) {
      if (key === "enabled" || key === "count") continue;
      this.uniforms[key] = uniform(key === "color" ? new Color(value) : value);
    }
    this.clock = uniform(0);
    this._activeCount = uniform(0);
    this.configure(settings);

    const u = this.uniforms;
    const life = particleLifecycle(u, this.clock);
    const active = instanceIndex.toFloat().lessThan(this._activeCount).toFloat();
    const look = t => appearance?.({ t, life, uniforms: u }) ?? {};

    this.line = new MeshLine().segments(segments).instances(this.maxCount)
      .gpuPositionNode(Fn(([t]) => path({ t, life, uniforms: u })))
      .widthFn(Fn(([width, t]) => width.mul(u.width).mul(look(t).width ?? 1).mul(life.alive).mul(active)))
      .colorFn(Fn(([, t]) => {
        const visual = look(t);
        const alpha = (visual.opacity ?? 1).mul(life.envelope).mul(u.opacity).mul(active);
        return vec4(visual.color ?? u.color, alpha);
      }))
      .lineWidth(1).sizeAttenuation(false).transparent(true).setFrustumCulled(false)
      .build();
    this.line.material.blending = AdditiveBlending;
    this.line.material.depthWrite = false;
    this.add(this.line);
  }

  configure(patch = {}) {
    Object.assign(this.settings, patch);
    const p = this.settings;
    this.visible = !!p.enabled;
    this._activeCount.value = Math.min(this.maxCount, Math.max(0, Math.floor(p.count)));
    for (const [key, node] of Object.entries(this.uniforms)) {
      if (node.value.isColor) node.value.set(p[key]);
      else node.value = p[key];
    }
    for (const key of ["lifetimeVariation", "opacity"])
      this.uniforms[key].value = Math.max(0, Math.min(1, p[key]));
  }

  /** CSS-pixel viewport the pixel widths are measured against. */
  resize(width, height) {
    this.line.resize(width, height);
  }

  /** Advance only while enabled. Scenes pass delta seconds, not absolute time. */
  update(delta = 0) {
    if (this.visible && this._activeCount.value > 0 && Number.isFinite(delta))
      this.clock.value += Math.max(0, delta) * Math.max(0, this.uniforms.speed.value);
  }

  reset() { this.clock.value = 0; }

  dispose() {
    this.line.dispose();
    this.removeFromParent();
  }
}
