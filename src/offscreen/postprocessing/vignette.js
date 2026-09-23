import { Fn, smoothstep, uniform, vec4, float } from "three/tsl";

/**
 * Screen-space vignette for use in a scene's postprocessingChain.
 * Darkens toward the corners; `radius` is where the falloff starts
 * (0 = center) and `smoothness` how wide the falloff band is.
 *
 * @returns {Function} - (colorNode, context) => Node, with live `.uniforms`
 */
export function createVignette({
  strength = 0.8,
  radius = 0.4,
  smoothness = 0.6,
} = {}) {
  const uniforms = {
    strength: uniform(strength),
    radius: uniform(radius),
    smoothness: uniform(smoothness),
  };

  const effect = (colorNode, { uvNode }) => Fn(() => {
    // Scene composites may supply RGB rather than RGBA. Promote explicitly
    // before reading alpha so both worker and main-thread shaders are valid.
    const color = vec4(colorNode).toVar();
    // 0 at center, 1 at the corners
    const dist = uvNode.sub(0.5).mul(2.0).length().mul(Math.SQRT1_2);
    const fade = smoothstep(
      uniforms.radius,
      uniforms.radius.add(uniforms.smoothness),
      dist,
    ).mul(uniforms.strength);
    return vec4(color.rgb.mul(float(1.0).sub(fade)), color.a);
  })();

  effect.uniforms = uniforms;
  return effect;
}
