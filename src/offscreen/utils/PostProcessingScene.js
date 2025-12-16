import * as THREE from "three/webgpu";
import { fsTriangle } from "./fullscreenTriangle.js";
import { PostProcessingMaterial } from "../materials/PostMaterial.js";

export class PostProcessingScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.material = new PostProcessingMaterial();
    this.scene.background = null;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geometry = fsTriangle;
    this.quad = new THREE.Mesh(geometry, this.material.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setTransition(transition) {
    this.material.setTransition(transition);
  }
}

