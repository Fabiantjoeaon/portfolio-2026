import { PerspectiveCamera, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { component } from "@/offscreen/dispatcher";

// Camera component allowing automatic orbit control override and such
class Camera extends component(PerspectiveCamera) {
  constructor() {
    super(40, 0, 0.1, 10000);
  }

  init() {
    this.target = new Vector3(0, 0, 0);
    this.position.set(20, 20, 20); // particle mode

    this.lookAt(this.target);
    this.offset = new Vector3(0, 0, 0);
  }

  onRaf() {}

  initOrbitControls(domElement) {
    this.controls = new OrbitControls(this, domElement);
    this.controls.enabled = true;
    this.controls.maxDistance = 1200;
    this.controls.minDistance = 0;
    this.controls.target.copy(this.target);
    this.controls.update();
  }

  calculateUnitSize(distance = this.position.z) {
    const vFov = (this.fov * Math.PI) / 180;
    const height = 2 * Math.tan(vFov / 2) * distance;
    const width = height * this.aspect;

    return {
      width,
      height,
    };
  }

  onResize({ ratio }) {
    this.aspect = ratio;
    this.unit = this.calculateUnitSize();
    this.updateProjectionMatrix();
  }
}

export default Camera;
