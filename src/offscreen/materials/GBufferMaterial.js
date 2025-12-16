import { normalView, mul, add } from "three/tsl";
import { NodeMaterial } from "three/webgpu";

/**
 * Node-based GBuffer material that outputs:
 *  - [0] Forward rendered color (with lighting)
 *  - [1] View-space normals mapped to 0..1
 *
 * Unlike traditional GBuffer materials, this preserves Three.js's forward
 * lighting while capturing normals for post-processing effects.
 */
export function createGBufferMaterial() {
  const material = new NodeMaterial();

  // Use default forward rendering for color (lighting will be applied)
  // The material doesn't override colorNode, so Three.js lighting works normally

  // For the normal attachment, we'll set this up via MRT in the render call
  // View-space normals mapped from [-1,1] to [0,1] for storage
  material.transparent = false;
  return material;
}

/**
 * Helper to create the normal output node for MRT
 * Maps view-space normals from [-1,1] to [0,1] for texture storage
 */
export function createNormalOutputNode() {
  // normalView gives view-space normals in [-1, 1]
  // Map to [0, 1] for storage: normal * 0.5 + 0.5
  return add(mul(normalView, 0.5), 0.5);
}

