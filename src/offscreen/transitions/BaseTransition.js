import { texture, uv } from "three/tsl";

export class BaseTransition {
  constructor(config = {}) {
    this.config = config;
  }

  // Subclasses return a color node (vec3) for the blended result
  // Inputs:
  // - prevTex, nextTex: THREE.Texture
  // - uvNode: uv() node
  // - mixNode: uniform(0..1)
  // Should return a TSL node representing RGB.
  // eslint-disable-next-line no-unused-vars
  buildColorNode({ prevTex, nextTex, uvNode, mixNode }) {
    const prevSample = texture(prevTex, uvNode ?? uv());
    const nextSample = texture(nextTex, uvNode ?? uv());
    return prevSample.rgb; // default: show previous
  }
}

