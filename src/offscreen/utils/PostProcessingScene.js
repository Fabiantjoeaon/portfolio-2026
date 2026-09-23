import * as THREE from "three/webgpu";
import { positionGeometry, vec4 } from "three/tsl";
import { fsTriangle } from "./fullscreenTriangle.js";
import { PostProcessingMaterial } from "../materials/PostMaterial.js";

export class PostProcessingScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.material = new PostProcessingMaterial();
    // Clip-space triangle can share the foreground camera and render pass.
    // It must leave depth untouched for the glass rendered after it.
    this.material.material.vertexNode = vec4(positionGeometry.xy, 0, 1);
    this.material.material.depthTest = false;
    this.material.material.depthWrite = false;
    this.scene.background = null;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geometry = fsTriangle;
    this.quad = new THREE.Mesh(geometry, this.material.material);
    this.quad.frustumCulled = false;
    this.quad.renderOrder = -Infinity;
    this.scene.add(this.quad);
  }

  setTransition(transition) {
    this.material.setTransition(transition);
  }
}
