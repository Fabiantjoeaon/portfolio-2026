import { float, mix, modelWorldMatrix, sin, smoothstep, uniform, uv, varying, vec4 } from "three/tsl";

/** Soft round flakes lit by the host scene. `light(worldPosition)` returns the
 * diffuse radiance of a white flake and is evaluated once per vertex; a sparse
 * per-flake glint makes a few catch the light at a time.
 */
export function createSnowAppearance({ light, softness = 0.8, glisten = 2, glistenSpeed = 2 }) {
  const controls = {
    softness: uniform(softness),
    glisten: uniform(glisten),
    glistenSpeed: uniform(glistenSpeed),
  };
  const appearance = ({ position, seed, clock, uniforms }) => {
    const world = modelWorldMatrix.mul(vec4(position, 1)).xyz;
    const glint = sin(clock.mul(controls.glistenSpeed).mul(mix(0.6, 1.4, seed)).add(seed.mul(97)))
      .mul(0.5).add(0.5).pow(24);
    const radiance = varying(light(world).mul(glint.mul(controls.glisten).add(1)));
    const radius = uv().sub(0.5).length().mul(2);
    const disc = float(1).sub(smoothstep(controls.softness.clamp(0, 1).oneMinus().mul(0.9), 1, radius));
    return { colorNode: uniforms.color.mul(radiance), opacityNode: disc.mul(disc) };
  };
  return { appearance, controls };
}
