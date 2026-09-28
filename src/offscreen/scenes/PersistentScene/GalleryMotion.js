const wrap = (value, count) => ((value % count) + count) % count;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const galleryLerpAlpha = (amount, delta) => 1 - Math.pow(1 - clamp(amount, 0, 1), Math.max(0, delta) * 60);

// Critically damped: (1 + ωt)e^(-ωt) falls below 1% at ωt ≈ 6.64.
const SETTLE = 6.64;
const MAX_VELOCITY = 20;
const WHEEL_COMMIT = 0.1;

/** Horizontal position in slide pitches, independent of viewport and renderer. */
export default class GalleryMotion {
  constructor(count, settings) {
    this.count = count;
    this.settings = settings;
    this.x = this.targetX = 0;
    this.velocity = 0;
    this.dragging = this.wheeling = false;
    this.wheelIdle = 0;
  }

  get index() { return wrap(Math.round(this.x), this.count); }
  get busy() { return this.dragging || this.wheeling || this.x !== this.targetX || this.velocity !== 0; }

  select({ step, index, immediate = false }) {
    this.dragging = this.wheeling = false;
    const base = Math.round(this.targetX);
    if (Number.isFinite(index)) {
      let distance = wrap(index - base, this.count);
      if (distance > this.count / 2) distance -= this.count;
      this.targetX = base + distance;
    } else if (Number.isFinite(step)) this.targetX = base + step;
    this.targetX = Math.round(this.targetX);
    if (immediate) { this.x = this.targetX; this.velocity = 0; }
  }

  grab() {
    this.dragging = true;
    this.wheeling = false;
    this.dragOrigin = this.targetX = this.x;
  }

  drag(distance) {
    if (this.dragging && Number.isFinite(distance)) this.targetX = this.dragOrigin + distance;
  }

  /** A flick past the threshold always reaches the next slide in its direction. */
  release(velocity = 0) {
    if (!this.dragging) return;
    this.dragging = false;
    const threshold = this.settings.galleryFlickVelocity;
    if (velocity > threshold) this.targetX = Math.floor(this.targetX) + 1;
    else if (velocity < -threshold) this.targetX = Math.ceil(this.targetX) - 1;
    else this.targetX = Math.round(this.targetX);
  }

  /** One trackpad swipe moves at most one slide; its momentum tail can't carry further. */
  wheel(distance) {
    if (!Number.isFinite(distance) || !distance) return;
    const magnitude = Math.abs(distance);
    const edge = this.targetX - this.wheelOrigin;
    // A rising delta at the edge is a new swipe, not the previous one's momentum.
    const renewed = this.wheeling && Math.abs(edge) > 0.999 && Math.sign(edge) === Math.sign(distance)
      && magnitude > 0.01 && magnitude > this.wheelMagnitude * 1.5;
    if (!this.wheeling || renewed) {
      this.wheelOrigin = renewed ? this.wheelOrigin + Math.sign(edge) : Math.round(this.targetX);
      if (!this.wheeling) this.targetX = this.x;
    }
    this.dragging = false;
    this.wheeling = true;
    this.wheelIdle = 0;
    this.wheelMagnitude = magnitude;
    this.targetX = clamp(this.targetX + distance, this.wheelOrigin - 1, this.wheelOrigin + 1);
  }

  update(delta, immediate = false) {
    if (this.wheeling) {
      this.wheelIdle += delta;
      if (this.wheelIdle >= this.settings.galleryWheelIdle) {
        this.wheeling = false;
        const offset = this.targetX - this.wheelOrigin;
        this.targetX = this.wheelOrigin + (Math.abs(offset) > WHEEL_COMMIT ? Math.sign(offset) : 0);
      }
    }
    if (immediate) {
      this.x = this.targetX;
      this.velocity = 0;
      return;
    }
    if (this.dragging || this.wheeling) {
      const previous = this.x;
      this.x += (this.targetX - this.x) * galleryLerpAlpha(this.settings.galleryInputLerp, delta);
      if (delta > 0) this.velocity = clamp((this.x - previous) / delta, -MAX_VELOCITY, MAX_VELOCITY);
      return;
    }
    // Exact critically damped spring: frame-rate independent and it inherits the
    // release velocity, so letting go continues the motion instead of restarting it.
    const omega = SETTLE / Math.max(0.05, this.settings.gallerySnapDuration);
    const error = this.x - this.targetX;
    const slope = this.velocity + omega * error;
    const decay = Math.exp(-omega * delta);
    this.x = this.targetX + (error + slope * delta) * decay;
    this.velocity = (this.velocity - omega * slope * delta) * decay;
    if (Math.abs(this.targetX - this.x) < 0.0001 && Math.abs(this.velocity) < 0.001) {
      this.x = this.targetX;
      this.velocity = 0;
    }
  }
}
