import { Plane, Raycaster, Vector2, Vector3 } from "three/webgpu";
import { mouse } from "./MouseTracker.js";

const UP = new Vector3(0, 1, 0);

/** Reusable pointer-to-world projection for scene interactions. */
export class PointerRaycaster {
  constructor(pointer = mouse) {
    this.pointer = pointer;
    this.raycaster = new Raycaster();
    this.ndc = new Vector2();
    this.previousNdc = new Vector2();
    this.plane = new Plane();
    this._initialized = false;
  }

  consumeMovement(epsilon = 1e-5) {
    this.ndc.set(this.pointer.x, this.pointer.y);
    if (!this._initialized) {
      this.previousNdc.copy(this.ndc);
      this._initialized = true;
      return false;
    }
    const moved = this.ndc.distanceToSquared(this.previousNdc) > epsilon * epsilon;
    this.previousNdc.copy(this.ndc);
    return moved;
  }

  rayFrom(camera) {
    this.ndc.set(this.pointer.x, this.pointer.y);
    camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, camera);
    return this.raycaster.ray;
  }

  intersectPlane(camera, plane, target = new Vector3()) {
    this.ndc.set(this.pointer.x, this.pointer.y);
    camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, camera);
    return this.raycaster.ray.intersectPlane(plane, target);
  }

  intersectHorizontal(camera, y, target = new Vector3()) {
    this.plane.set(UP, -y);
    return this.intersectPlane(camera, this.plane, target);
  }

  intersectObjects(camera, objects, recursive = true) {
    this.ndc.set(this.pointer.x, this.pointer.y);
    camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }
}
