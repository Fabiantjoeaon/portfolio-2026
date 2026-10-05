import { Color, Vector4 } from "three/webgpu";
import { cos, exp, float, positionWorld, sin, uniform } from "three/tsl";

const MAX_RIPPLES = 4;

/**
 * Click ripples shared by the ice floor and cave materials. Rings are measured
 * in world space, so one ripple crosses the floor/wall seam as a single wave
 * even though the two surfaces use unrelated UVs.
 */
export class IceRipples {
  constructor(settings) {
    this.time = uniform(0);
    this.speed = uniform(settings.rippleSpeed);
    this.width = uniform(settings.rippleWidth);
    this.frequency = uniform(settings.rippleFrequency);
    this.decay = uniform(settings.rippleDecay);
    this.falloff = uniform(settings.rippleFalloff);
    this.parallax = uniform(settings.rippleParallax);
    this.refraction = uniform(settings.rippleRefraction);
    this.glow = uniform(settings.rippleGlow);
    this.color = uniform(new Color(settings.rippleColor));
    this.lightIntensity = uniform(settings.rippleLightIntensity);
    this.lightWidth = uniform(settings.rippleLightWidth);
    this.lightColor = uniform(new Color(settings.rippleLightColor));
    this.hoverRadius = uniform(settings.rippleHoverRadius);
    this.hoverBreath = uniform(settings.rippleHoverBreath);
    this.hoverSpeed = uniform(settings.rippleHoverSpeed);
    this.hoverWidth = uniform(settings.rippleHoverWidth);
    this.hoverStrength = uniform(settings.rippleHoverStrength);
    // xyz: smoothed cursor point on the ice, w: 0..1 visibility.
    this.hover = uniform(new Vector4());
    this.centers = Array.from({ length: MAX_RIPPLES }, () => uniform(new Vector4(0, 0, 0, -1e4)));
    this._next = 0;
    this._nodes = null;
  }

  add(point) {
    this.centers[this._next].value.set(point.x, point.y, point.z, this.time.value);
    this._next = (this._next + 1) % MAX_RIPPLES;
  }

  update(seconds) {
    this.time.value = seconds;
  }

  updateHover(point, active, delta) {
    const hover = this.hover.value;
    const visible = hover.w > 0.01;
    if (active && !visible) hover.set(point.x, point.y, point.z, hover.w);
    else if (active) {
      const follow = 1 - Math.exp(-delta * 14);
      hover.x += (point.x - hover.x) * follow;
      hover.y += (point.y - hover.y) * follow;
      hover.z += (point.z - hover.z) * follow;
    }
    hover.w += ((active ? 1 : 0) - hover.w) * (1 - Math.exp(-delta * (active ? 5 : 8)));
  }

  /**
   * `height`: signed wave for the parallax offset, `ring`: 0..1 envelope,
   * `light`: a wider band travelling with each wavefront, brighter on crests.
   */
  nodes() {
    if (this._nodes) return this._nodes;
    let height = float(0);
    let ring = float(0);
    let light = float(0);
    for (const center of this.centers) {
      const age = this.time.sub(center.w).max(0);
      const distance = positionWorld.distance(center.xyz);
      const offset = distance.sub(age.mul(this.speed));
      const fade = exp(age.mul(this.decay).negate()).div(distance.mul(this.falloff).add(1));
      const band = offset.div(this.width);
      const envelope = exp(band.mul(band).negate()).mul(fade);
      const spread = offset.div(this.lightWidth);
      const crest = cos(offset.mul(this.frequency)).mul(0.35).add(0.65);
      height = height.add(sin(offset.mul(this.frequency)).mul(envelope));
      ring = ring.add(envelope);
      light = light.add(exp(spread.mul(spread).negate()).mul(fade).mul(crest));
    }

    const breath = sin(this.time.mul(this.hoverSpeed)).mul(this.hoverBreath).add(1);
    const hoverOffset = positionWorld.distance(this.hover.xyz).sub(this.hoverRadius.mul(breath));
    const hoverBand = hoverOffset.div(this.hoverWidth);
    const hoverEnvelope = exp(hoverBand.mul(hoverBand).negate()).mul(this.hover.w).mul(this.hoverStrength);
    height = height.add(hoverBand.mul(hoverEnvelope));
    ring = ring.add(hoverEnvelope);
    light = light.add(hoverEnvelope.mul(0.25));

    this._nodes = { height, ring: ring.clamp(0, 1), light };
    return this._nodes;
  }
}
