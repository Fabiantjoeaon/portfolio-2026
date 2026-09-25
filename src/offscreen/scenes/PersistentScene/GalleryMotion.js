const wrap = (value, count) => ((value % count) + count) % count;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const galleryLerpAlpha = (amount, delta) => 1 - Math.pow(1 - clamp(amount, 0, 1), Math.max(0, delta) * 60);

/** Horizontal position in slide pitches, independent of viewport and renderer. */
export default class GalleryMotion {
  constructor(count, settings) {
    this.count = count;
    this.settings = settings;
    this.x = this.targetX = 0;
    this.dragging = this.wheeling = false;
    this.wheelIdle = 0;
    this.direction = 1;
  }

  get index() { return wrap(Math.round(this.x), this.count); }
  get busy() { return this.dragging || this.wheeling || Math.abs(this.x - this.targetX) > 0.0001; }

  select({ step, index, immediate = false }) {
    this.dragging = this.wheeling = false;
    const base = Math.round(this.targetX);
    if (Number.isFinite(index)) {
      let distance = wrap(index - base, this.count);
      if (distance > this.count / 2) distance -= this.count;
      this.targetX = base + distance;
    } else if (Number.isFinite(step)) this.targetX = base + step;
    this.targetX = Math.round(this.targetX);
    if (immediate) this.x = this.targetX;
  }

  grab() {
    this.dragging = true;
    this.wheeling = false;
    this.dragOrigin = this.targetX = this.x;
  }

  drag(distance) {
    if (this.dragging && Number.isFinite(distance)) this.targetX = this.dragOrigin + distance;
  }

  release(velocity = 0) {
    if (!this.dragging) return;
    this.dragging = false;
    // A small flick bias; long drags still snap at their actual destination.
    this.targetX = Math.round(this.targetX + clamp(velocity * this.settings.galleryFlick, -0.35, 0.35));
  }

  wheel(distance) {
    if (!Number.isFinite(distance)) return;
    if (!this.wheeling) this.targetX = this.x;
    this.dragging = false;
    this.wheeling = true;
    this.wheelIdle = 0;
    this.targetX += distance;
  }

  update(delta, immediate = false) {
    if (this.wheeling) {
      this.wheelIdle += delta;
      if (this.wheelIdle >= this.settings.galleryWheelIdle) {
        this.wheeling = false;
        this.targetX = Math.round(this.targetX);
      }
    }
    const previous = this.x;
    const amount = this.dragging || this.wheeling ? this.settings.galleryInputLerp : this.settings.gallerySnapLerp;
    this.x += (this.targetX - this.x) * (immediate ? 1 : galleryLerpAlpha(amount, delta));
    if (Math.abs(this.targetX - this.x) < 0.0001) this.x = this.targetX;
    if (Math.abs(this.x - previous) > 0.00001) this.direction = Math.sign(this.x - previous);
  }
}
