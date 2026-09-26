import { Vector3 } from "three/webgpu";

const direction = new Vector3();
const sample = new Vector3();

/**
 * Turns consecutive pointer hits into evenly spaced samples along the path,
 * plus a smoothed speed (world units / s) used as interaction intensity.
 */
export class PointerStroke {
  constructor({ speedScale = 20, smoothing = 10 } = {}) {
    this.speedScale = speedScale;
    this.smoothing = smoothing;
    this.last = new Vector3();
    this.active = false;
    this.carry = 0;
    this.speed = 0;
  }

  get intensity() {
    return Math.min(1, this.speed / Math.max(this.speedScale, 1e-5));
  }

  end() {
    this.active = false;
    this.carry = 0;
    this.speed = 0;
  }

  /**
   * @param {Vector3|null} hit
   * @param {number} delta - Seconds since the previous update
   * @param {number} spacing - World distance between samples (<= 0 disables)
   * @param {(point: Vector3, direction: Vector3) => void} onSample - First
   *   sample of a stroke has a zero direction; both vectors are reused.
   */
  update(hit, delta, spacing, onSample) {
    if (!hit) {
      this.end();
      return;
    }
    if (!this.active) {
      this.active = true;
      this.last.copy(hit);
      onSample(hit, direction.set(0, 0, 0));
      return;
    }
    const distance = this.last.distanceTo(hit);
    const k = 1 - Math.exp(-Math.max(delta, 0) * this.smoothing);
    this.speed += (distance / Math.max(delta, 1 / 240) - this.speed) * k;
    if (!(spacing > 0) || distance <= 1e-5) {
      this.last.copy(hit);
      return;
    }
    direction.subVectors(hit, this.last);
    let along = spacing - this.carry;
    while (along <= distance) {
      sample.lerpVectors(this.last, hit, along / distance);
      onSample(sample, direction);
      along += spacing;
    }
    this.carry = distance - (along - spacing);
    this.last.copy(hit);
  }
}
