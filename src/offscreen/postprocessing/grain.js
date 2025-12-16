import { add, mul, fract, sin, dot, vec2 } from "three/tsl";

/**
 * Static film grain / noise based only on UVs.
 *
 * - Intentionally does NOT animate (no time uniform) to keep integration simple.
 * - Scalars are sanitized to avoid NaN/Infinity WGSL literals.
 */
export function grain(colorNode, context = {}) {
  const { uvNode } = context;
  let { amount = 0.04 } = context;

  if (!uvNode) return colorNode;

  amount = Number.isFinite(amount) ? amount : 0.0;
  if (amount <= 0.0) return colorNode;

  // Very small static noise pattern based on UV
  const st = uvNode;
  const n = fract(mul(sin(dot(st, vec2(12.9898, 78.233))), 43758.5453));

  const noise = mul(n.sub(0.5), amount * 2.0);
  return add(colorNode, noise);
}

