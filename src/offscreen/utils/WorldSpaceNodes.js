import { cross, dFdx, dFdy, float, normalize, texture, vec3, vec4 } from "three/tsl";

/**
 * Lazy TSL node bundle exposing a scene's depth, reconstructed world
 * position and derivative world normal — all sourced from the scene's
 * existing depth texture, so no extra render passes or attachments.
 *
 * Nodes are built on first access and cached, so consumers (transitions,
 * postprocessing effects) share the same node instances and unused data
 * never reaches the shader.
 *
 * Reconstruction convention: render targets store NDC.y = +1 at texture
 * row 0 and WebGPU depth is already 0..1, so only uv.y needs the flip.
 *
 * @param {Object} params
 * @param {THREE.DepthTexture} params.depthTexture
 * @param {Node} params.uvNode - screen uv (y-down, row 0 at top)
 * @param {UniformNode<mat4>} params.projectionMatrixInverse
 * @param {UniformNode<mat4>} params.matrixWorld - camera world matrix
 */
export function createWorldSpaceNodes({
  depthTexture,
  uvNode,
  projectionMatrixInverse,
  matrixWorld,
}) {
  let depth = null;
  let worldPosition = null;
  let worldNormal = null;

  return {
    get depth() {
      if (!depth) {
        depth = texture(depthTexture, uvNode).x;
      }
      return depth;
    },

    get worldPosition() {
      if (!worldPosition) {
        const ndc = vec4(
          uvNode.x.mul(2).sub(1),
          float(1).sub(uvNode.y).mul(2).sub(1),
          this.depth,
          1,
        );
        const view = projectionMatrixInverse.mul(ndc);
        const world4 = matrixWorld.mul(view);
        worldPosition = world4.xyz.div(world4.w);
      }
      return worldPosition;
    },

    get worldNormal() {
      if (!worldNormal) {
        // Screen-space derivatives of the reconstructed position — no
        // normal buffer needed. Tiny offsets keep the normalizes away
        // from zero-length vectors.
        const dx = normalize(dFdx(this.worldPosition).add(vec3(0.0001)));
        const dy = normalize(dFdy(this.worldPosition).add(vec3(0.0001)));
        worldNormal = normalize(cross(dx, dy).add(vec3(0.0001)));
      }
      return worldNormal;
    },
  };
}
