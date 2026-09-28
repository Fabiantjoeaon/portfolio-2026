import { abs, cross, float, normalize, select, texture, vec2, vec4 } from "three/tsl";

/**
 * Lazy TSL node bundle exposing a scene's depth, reconstructed world
 * position and world normal — all sourced from the scene's existing depth
 * texture, so no extra render passes or attachments.
 *
 * Depth and position are built on first access and cached, so consumers
 * (transitions, postprocessing effects) share the same node instances and
 * unused data never reaches the shader.
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

  const reconstruct = (st, d) => {
    const ndc = vec4(st.x.mul(2).sub(1), float(1).sub(st.y).mul(2).sub(1), d, 1);
    const world4 = matrixWorld.mul(projectionMatrixInverse.mul(ndc));
    return world4.xyz.div(world4.w);
  };

  return {
    get depth() {
      if (!depth) {
        depth = texture(depthTexture, uvNode).x;
      }
      return depth;
    },

    get worldPosition() {
      if (!worldPosition) {
        worldPosition = reconstruct(uvNode, this.depth);
      }
      return worldPosition;
    },

    cameraPosition() {
      return matrixWorld.element(3).xyz;
    },

    /**
     * Per axis, differences against whichever neighbour lies closer in depth,
     * so silhouettes don't bend normals toward the background. Four depth
     * loads and no derivatives, so it is valid inside per-pixel branches.
     * Builds fresh nodes per call: callers own the scope they're used in.
     *
     * @param {Node<vec3>} [position] - this pixel's world position (a var)
     */
    worldNormal(position = this.worldPosition) {
      const texel = float(1).div(vec2(texture(depthTexture).size(0)));
      const d = this.depth;
      const tap = (x, y) => {
        const st = uvNode.add(texel.mul(vec2(x, y)));
        const dn = texture(depthTexture, st).x;
        return { d: dn, p: reconstruct(st, dn) };
      };
      const l = tap(-1, 0);
      const r = tap(1, 0);
      const u = tap(0, -1);
      const b = tap(0, 1);
      const dx = select(abs(l.d.sub(d)).lessThan(abs(r.d.sub(d))), position.sub(l.p), r.p.sub(position));
      const dy = select(abs(u.d.sub(d)).lessThan(abs(b.d.sub(d))), position.sub(u.p), b.p.sub(position));
      const n = normalize(cross(dx, dy).add(1e-6)).toVar();
      return select(n.dot(this.cameraPosition().sub(position)).lessThan(0), n.negate(), n);
    },
  };
}
