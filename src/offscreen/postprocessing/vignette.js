import { sub, mul, length, clamp, vec2 } from "three/tsl";

/**
 * Simple vignette effect.
 *
 * - Multiplies the input color by a radial falloff from the center.
 * - All scalars are sanitized to avoid NaN/Infinity in WGSL.
 *
 * @param {Node} colorNode - incoming rgb node
 * @param {Object} context
 * @param {Node} context.uvNode - uv() node
 * @param {number} [context.strength=0.8] - vignette strength (0..2)
 * @param {number} [context.smoothness=0.5] - edge softness (0..2)
 * @returns {Node} - modified rgb node
 */
export function vignette(colorNode, context = {}) {
  const { uvNode } = context;
  let { strength = 0.8, smoothness = 0.5 } = context;

  if (!uvNode) return colorNode;

  // Sanitize scalars to keep the generated WGSL finite.
  strength = Number.isFinite(strength) ? strength : 0.8;
  smoothness = Number.isFinite(smoothness) ? smoothness : 0.5;

  const st = uvNode;
  const center = vec2(0.5, 0.5);
  const dist = length(sub(st, center));

  const falloff = Math.max(0.0, strength);
  const soft = Math.max(0.0001, smoothness);
  const scale = falloff / soft;

  const vig = clamp(sub(1.0, mul(dist, scale)), 0.0, 1.0);

  return mul(colorNode, vig);
}

