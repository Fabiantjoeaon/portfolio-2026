import { AdditiveBlending, Color, Sprite, SpriteNodeMaterial, Vector3 } from "three/webgpu";
import {
  float, floor, hash, instanceIndex, mix, sin, smoothstep,
  uint, uniform, uv, varying, vec3,
} from "three/tsl";

const defaults = {
  enabled: true, count: 160, lifetime: 14, lifetimeVariation: 0.3,
  delay: 1, fadeIn: 1.5, fadeOut: 2, size: 1, sizeVariation: 0.35,
  opacity: 0.55, color: 0x91aaff, speed: 1,
  origin: [0, 0, 0], bounds: [20, 20, 20], velocity: [0, 0.25, 0],
  drift: 0.8, driftSpeed: 0.4, rotationSpeed: 0, rotationAmount: 0,
};

/** Repeating ambient billboards. Local-space emission box; units/seconds.
 * No simulation buffers or per-frame particle uploads. The optional appearance
 * factory receives vertex lifecycle nodes and returns color/opacity/scale nodes.
 * Use varying() when consuming its age, progress or seed in a fragment node.
 */
export class ParticleSystem extends Sprite {
  constructor({ settings = {}, appearance, maxCount = 2000 } = {}) {
    const material = new SpriteNodeMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      blending: AdditiveBlending,
    });
    super(material);
    this.name = "Ambient particles";
    this.geometry = this.geometry.clone();
    this.frustumCulled = false;
    this.maxCount = Math.max(0, Math.floor(maxCount));
    this.settings = { ...defaults };
    this.uniforms = {};
    for (const [key, value] of Object.entries(defaults)) {
      if (key === "enabled" || key === "count") continue;
      this.uniforms[key] = uniform(key === "color" ? new Color(value)
        : Array.isArray(value) ? new Vector3(...value) : value);
    }
    this.clock = uniform(0);
    this.configure(settings);
    const u = this.uniforms;
    const seed = hash(instanceIndex.add(uint(1)));
    const lifetime = u.lifetime.max(0.1).mul(mix(1, mix(0.5, 1.5, seed), u.lifetimeVariation));
    const period = lifetime.add(u.delay.max(0));
    // Prewarm a staggered population, with a fresh spawn point each cycle.
    const elapsed = this.clock.add(seed.mul(period));
    const cycle = floor(elapsed.div(period));
    const age = elapsed.mod(period);
    const progress = age.div(lifetime).clamp(0, 1);
    const random = salt => hash(instanceIndex.add(uint(salt)).add(uint(cycle).mul(uint(7919))));
    const spawn = vec3(random(13), random(41), random(97)).sub(0.5).mul(u.bounds);
    const phase = age.mul(u.driftSpeed).add(seed.mul(Math.PI * 2));
    const drift = vec3(sin(phase), sin(phase.mul(0.73).add(2)), sin(phase.mul(0.57).add(4))).mul(u.drift);
    material.positionNode = u.origin.add(spawn).add(u.velocity.mul(age)).add(drift);
    const alive = age.lessThan(lifetime).toFloat();
    const envelope = smoothstep(0, u.fadeIn.max(0.001).min(lifetime.mul(0.5)), age)
      .mul(smoothstep(0, u.fadeOut.max(0.001).min(lifetime.mul(0.5)), lifetime.sub(age)))
      .mul(alive);
    material.scaleNode = u.size.mul(mix(1, mix(0.5, 1.5, random(173)), u.sizeVariation))
      .mul(mix(0.75, 1, envelope)).mul(alive);
    // Bounded sway in degrees; amount=0 is exactly upright at every speed.
    material.rotationNode = sin(age.mul(u.rotationSpeed).add(seed.mul(Math.PI * 2)))
      .mul(u.rotationAmount.max(0)).mul(Math.PI / 180);
    const visual = appearance?.({ age, progress, seed, clock: this.clock, uniforms: u }) ?? {
      colorNode: u.color,
      opacityNode: float(1).sub(smoothstep(0.1, 0.5, uv().sub(0.5).length())),
    };
    if (visual.scaleNode) material.scaleNode = material.scaleNode.mul(visual.scaleNode);
    material.colorNode = visual.colorNode ?? u.color;
    material.opacityNode = (visual.opacityNode ?? float(1)).mul(varying(envelope)).mul(u.opacity);
  }

  configure(patch = {}) {
    Object.assign(this.settings, patch);
    const p = this.settings;
    this.visible = !!p.enabled;
    this.count = Math.min(this.maxCount, Math.max(0, Math.floor(p.count)));
    for (const [key, node] of Object.entries(this.uniforms)) {
      if (node.value.isColor) node.value.set(p[key]);
      else if (node.value.isVector3) {
        if (p[key].isVector3) node.value.copy(p[key]);
        else node.value.fromArray(p[key]);
      } else node.value = p[key];
    }
    for (const key of ["lifetimeVariation", "sizeVariation", "opacity"])
      this.uniforms[key].value = Math.max(0, Math.min(1, p[key]));
  }

  /** Advance only while enabled. Scenes pass delta seconds, not absolute time. */
  update(delta = 0) {
    if (this.visible && this.count > 0 && Number.isFinite(delta))
      this.clock.value += Math.max(0, delta) * Math.max(0, this.uniforms.speed.value);
  }

  reset() { this.clock.value = 0; }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.removeFromParent();
  }
}
