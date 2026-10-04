const wrap = (value, count) => ((value % count) + count) % count;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
/** smooothy's `damp`: `lerp` is its lerpFactor, a time constant in seconds. */
export const damp = (from, to, lerp, delta) => from + (to - from) * (1 - Math.exp(-Math.max(0, delta) / Math.max(0.005, lerp)));

const MAX_VELOCITY = 20;
const WHEEL_COMMIT = 0.1;
const REST = 0.0005;

/**
 * Horizontal position in slide pitches, independent of viewport and renderer.
 * smooothy's model: input moves an integer-snapped `targetX`, and `x` damps
 * toward it, so letting go keeps the lag as momentum instead of a spring.
 */
export default class GalleryMotion {
  constructor(count, settings) {
    this.count = count;
    this.settings = settings;
    this.x = this.targetX = 0;
    this.velocity = 0;
    this.speed = 0;
    this.dragging = this.wheeling = false;
    this.wheelIdle = 0;
  }

  get index() { return wrap(Math.round(this.x), this.count); }
  get busy() { return this.dragging || this.wheeling || this.x !== this.targetX; }
  /** Close enough to the snapped slide that it reads as at rest. */
  get settled() { return !this.dragging && !this.wheeling && Math.abs(this.targetX - this.x) < this.settings.gallerySettleDistance; }

  select({ step, index, immediate = false }) {
    this.dragging = this.wheeling = false;
    const base = Math.round(this.targetX);
    if (Number.isFinite(index)) {
      let distance = wrap(index - base, this.count);
      if (distance > this.count / 2) distance -= this.count;
      this.targetX = base + distance;
    } else if (Number.isFinite(step)) this.targetX = base + step;
    this.targetX = Math.round(this.targetX);
    if (immediate) { this.x = this.targetX; this.velocity = this.speed = 0; }
  }

  grab() {
    this.dragging = true;
    this.wheeling = false;
    this.dragOrigin = this.targetX = this.x;
  }

  drag(distance) {
    if (this.dragging && Number.isFinite(distance)) this.targetX = this.dragOrigin + distance * this.settings.galleryDragSensitivity;
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
    distance *= this.settings.galleryScrollSensitivity;
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
      this.velocity = this.speed = 0;
      return;
    }
    const previous = this.x;
    const input = this.dragging || this.wheeling;
    this.x = damp(this.x, this.targetX, this.settings[input ? 'galleryDragLerp' : 'galleryLerp'], delta);
    if (!input && Math.abs(this.targetX - this.x) < REST) this.x = this.targetX;
    if (delta > 0) this.velocity = clamp((this.x - previous) / delta, -MAX_VELOCITY, MAX_VELOCITY);
    // smooothy decays its speed by a fixed factor per frame; scaled here to 60fps.
    const keep = Math.pow(clamp(this.settings.gallerySpeedDecay, 0, 0.999), Math.max(0, delta) * 60);
    this.speed = this.velocity + (this.speed - this.velocity) * keep;
    if (Math.abs(this.speed) < 1e-4 && this.x === this.targetX) this.speed = 0;
  }
}
