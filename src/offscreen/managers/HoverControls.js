import * as THREE from "three/webgpu";
import { mouse } from "../input/MouseTracker.js";
import { lerp } from "../lib/math.js";

export class HoverControls {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.pos = options.pos ?? new THREE.Vector3(0, 0, 0); // Position influence intensity
    this.rot = options.rot ?? new THREE.Vector3(0, 0, 0); // Rotation influence intensity
    this.positiveYOnly = options.positiveYOnly ?? false;
    this.rate = options.rate ?? 0.01;
    this.multiplier = options.multiplier ?? 1.0;

    // Internal state for damping
    this.currentPosOffset = new THREE.Vector3();
    this.currentRotOffset = new THREE.Euler();

    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();
  }

  update(delta) {
    if (!this.enabled) {
      // Damp back to zero
      this.currentPosOffset.x = lerp(
        this.currentPosOffset.x,
        0,
        this.rate,
        delta
      );
      this.currentPosOffset.y = lerp(
        this.currentPosOffset.y,
        0,
        this.rate,
        delta
      );
      this.currentPosOffset.z = lerp(
        this.currentPosOffset.z,
        0,
        this.rate,
        delta
      );

      this.currentRotOffset.x = lerp(
        this.currentRotOffset.x,
        0,
        this.rate,
        delta
      );
      this.currentRotOffset.y = lerp(
        this.currentRotOffset.y,
        0,
        this.rate,
        delta
      );
      this.currentRotOffset.z = lerp(
        this.currentRotOffset.z,
        0,
        this.rate,
        delta
      );
      return;
    }

    let { x, y } = mouse;

    x *= this.multiplier;
    y *= this.multiplier;

    // Calculate target offsets
    // Position offset: mouseX * intensityX, mouseY * intensityY, ...
    this.targetPosition.set(
      x * this.pos.x,
      y * this.pos.y,
      y * this.pos.z // Reference used y for z pos influence too
    );

    // Rotation offset: mouseY * intensityX, mouseX * intensityY, ...
    // Reference: targetRotation.set(y * rot[0], x * rot[1], x * rot[2]);
    this.targetRotation.set(y * this.rot.x, x * this.rot.y, x * this.rot.z);

    // Damp values
    this.currentPosOffset.x = lerp(
      this.currentPosOffset.x,
      this.targetPosition.x,
      this.rate,
      delta
    );
    this.currentPosOffset.y = lerp(
      this.currentPosOffset.y,
      this.targetPosition.y,
      this.rate,
      delta
    );
    this.currentPosOffset.z = lerp(
      this.currentPosOffset.z,
      this.targetPosition.z,
      this.rate,
      delta
    );

    this.currentRotOffset.x = lerp(
      this.currentRotOffset.x,
      this.targetRotation.x,
      this.rate,
      delta
    );
    this.currentRotOffset.y = lerp(
      this.currentRotOffset.y,
      this.targetRotation.y,
      this.rate,
      delta
    );
    this.currentRotOffset.z = lerp(
      this.currentRotOffset.z,
      this.targetRotation.z,
      this.rate,
      delta
    );
  }

  /**
   * Apply the hover effect to a camera
   * @param {THREE.Camera} camera
   */
  apply(camera) {
    // Add offsets to current camera transform
    // Note: This assumes the camera's base transform is already set before calling this.
    // Ideally, we modify the position/rotation *after* the base logic (like OrbitControls or interpolation)

    camera.position.add(this.currentPosOffset);

    // For rotation, it's safer to add to rotation, but order matters.
    // Adding euler values directly is simple approximation for small angles.
    camera.rotation.x += this.currentRotOffset.x;
    camera.rotation.y += this.currentRotOffset.y;
    camera.rotation.z += this.currentRotOffset.z;
  }
}
