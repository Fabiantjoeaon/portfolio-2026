import { Color, Vector4 } from "three/webgpu";
import { exp, float, positionWorld, sin, uniform } from "three/tsl";

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

  /** `height`: signed wave for the parallax offset, `ring`: 0..1 envelope. */
  nodes() {
    if (this._nodes) return this._nodes;
    let height = float(0);
    let ring = float(0);
    for (const center of this.centers) {
      const age = this.time.sub(center.w).max(0);
      const distance = positionWorld.distance(center.xyz);
      const offset = distance.sub(age.mul(this.speed));
      const band = offset.div(this.width);
      const envelope = exp(band.mul(band).negate())
        .mul(exp(age.mul(this.decay).negate()))
        .div(distance.mul(this.falloff).add(1));
      height = height.add(sin(offset.mul(this.frequency)).mul(envelope));
      ring = ring.add(envelope);
    }
    this._nodes = { height, ring: ring.clamp(0, 1) };
    return this._nodes;
  }
}
