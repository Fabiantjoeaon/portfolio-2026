import { mix, vec3 } from "three/tsl";

/**
 * Simple color grading / tint effect.
 *
 * Scalars are clamped/sanitized to avoid NaN/Infinity WGSL literals.
 */
export function colorGrade(colorNode, context = {}) {
  let { tint = [1, 1, 1], intensity = 0.0 } = context;

  if (!Array.isArray(tint) || tint.length < 3) {
    tint = [1, 1, 1];
  }

  const safeIntensity = Number.isFinite(intensity) ? intensity : 0.0;
  if (safeIntensity <= 0.0001) return colorNode;

  const r = Number.isFinite(tint[0]) ? tint[0] : 1;
  const g = Number.isFinite(tint[1]) ? tint[1] : 1;
  const b = Number.isFinite(tint[2]) ? tint[2] : 1;

  const tintVec = vec3(r, g, b);
  return mix(colorNode, tintVec, safeIntensity);
}

