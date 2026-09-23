/**
 * Linearly Transformed Cosines — TSL ports of Heitz/Hill (Real-Time Polygonal-Light
 * Shading with LTC). Mirrors the logic of three/src/nodes/functions/BSDF/LTC.js
 * but exposes the unnormalized vector form factor in addition to the horizon-
 * clipped scalar, which the textured variant of the model needs to find the
 * "average direction" of incoming light on the light plane.
 *
 * References:
 * - Heitz, Dupuy, Hill, Neubelt 2016 — LTC paper
 * - github.com/selfshadow/ltc_code
 */

import { Fn, If, mat3, max, vec2, vec3, vec4 } from "three/tsl";

const LUT_SIZE = 64.0;
const LUT_SCALE = (LUT_SIZE - 1.0) / LUT_SIZE;
const LUT_BIAS = 0.5 / LUT_SIZE;

export const LTC_Uv = Fn(({ N, V, roughness }) => {
  const dotNV = N.dot(V).saturate();
  const uv = vec2(roughness, dotNV.oneMinus().sqrt());
  return uv.mul(LUT_SCALE).add(LUT_BIAS);
});

export const LTC_ClippedSphereFormFactor = Fn(({ f }) => {
  const l = f.length();
  return max(l.mul(l).add(f.z).div(l.add(1.0)), 0);
});

export const LTC_EdgeVectorFormFactor = Fn(({ v1, v2 }) => {
  const x = v1.dot(v2);
  const y = x.abs().toVar();

  const a = y.mul(0.0145206).add(0.4965155).mul(y).add(0.8543985).toVar();
  const b = y.add(4.1616724).mul(y).add(3.417594).toVar();
  const v = a.div(b);

  const thetaSinTheta = x
    .greaterThan(0.0)
    .select(v, max(x.mul(x).oneMinus(), 1e-7).inverseSqrt().mul(0.5).sub(v));

  return v1.cross(v2).mul(thetaSinTheta);
});

/**
 * Horizon-clipped polygon integration. Returns vec3(scalar) like Three.js's
 * built-in. Use this for the specular intensity (with the LTC matrix mInv
 * derived from the LTC LUT).
 */
export const LTC_Evaluate = Fn(({ N, V, P, mInv, p0, p1, p2, p3 }) => {
  const v1 = p1.sub(p0).toVar();
  const v2 = p3.sub(p0).toVar();
  const lightNormal = v1.cross(v2);
  const result = vec3(0).toVar();

  If(lightNormal.dot(P.sub(p0)).greaterThanEqual(0.0), () => {
    const T1 = V.sub(N.mul(V.dot(N)))
      .normalize()
      .toVar();
    const T2 = N.cross(T1).negate().toVar();

    const mat = mInv.mul(mat3(T1, T2, N).transpose()).toVar();

    const c0 = mat.mul(p0.sub(P)).normalize().toVar();
    const c1 = mat.mul(p1.sub(P)).normalize().toVar();
    const c2 = mat.mul(p2.sub(P)).normalize().toVar();
    const c3 = mat.mul(p3.sub(P)).normalize().toVar();

    const ff = vec3(0).toVar();
    ff.addAssign(LTC_EdgeVectorFormFactor({ v1: c0, v2: c1 }));
    ff.addAssign(LTC_EdgeVectorFormFactor({ v1: c1, v2: c2 }));
    ff.addAssign(LTC_EdgeVectorFormFactor({ v1: c2, v2: c3 }));
    ff.addAssign(LTC_EdgeVectorFormFactor({ v1: c3, v2: c0 }));

    result.assign(vec3(LTC_ClippedSphereFormFactor({ f: ff })));
  });

  return result;
});

/**
 * Polygon integration with mInv = identity, additionally returning the
 * world-space "average direction" of incoming light (needed by the textured
 * variant of the model to find the texel that contributes most to this shaded
 * pixel — Heitz/Dupuy/Hill's "Daniel" lookup).
 *
 * Returns vec4: xyz = world-space avg light direction (un-normalized form
 * factor), w = horizon-clipped scalar form factor (diffuse intensity).
 *
 * The identity diffuse transform lets us integrate directly in world space.
 * The specular path still needs the per-pixel LTC matrix; its transformed
 * lookup direction would not describe the original emitting quad.
 */
export const LTC_Evaluate_WithLookupDir = Fn(({ N, P, p0, p1, p2, p3 }) => {
  const v1 = p1.sub(p0).toVar();
  const v2 = p3.sub(p0).toVar();
  const lightNormal = v1.cross(v2);
  const result = vec4(0).toVar();

  If(lightNormal.dot(P.sub(p0)).greaterThanEqual(0.0), () => {
    // Diffuse uses an identity LTC matrix: integrate directly in world
    // space instead of transforming four corners into a tangent frame and
    // transforming the result back. The old [T1, -N×T1, N] frame has
    // determinant -1, so negate the world-space edge sum to keep its winding.
    const c0 = p0.sub(P).normalize().toVar();
    const c1 = p1.sub(P).normalize().toVar();
    const c2 = p2.sub(P).normalize().toVar();
    const c3 = p3.sub(P).normalize().toVar();

    const ff = vec3(0).toVar();
    ff.addAssign(LTC_EdgeVectorFormFactor({ v1: c0, v2: c1 }));
    ff.addAssign(LTC_EdgeVectorFormFactor({ v1: c1, v2: c2 }));
    ff.addAssign(LTC_EdgeVectorFormFactor({ v1: c2, v2: c3 }));
    ff.addAssign(LTC_EdgeVectorFormFactor({ v1: c3, v2: c0 }));

    ff.mulAssign(-1);
    const l = ff.length().toVar();
    const clipped = max(l.mul(l).add(N.dot(ff)).div(l.add(1.0)), 0);
    result.assign(vec4(ff, clipped));
  });

  return result;
});
