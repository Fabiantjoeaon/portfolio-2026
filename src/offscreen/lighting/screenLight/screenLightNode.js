/**
 * Textured Linearly-Transformed-Cosines area light contribution.
 *
 * Returns an additive RGB TSL node that should be added on top of a PBR
 * material's lit output (e.g. into `emissiveNode`). Combines:
 *
 *  - Diffuse:  diffuseColor * sampledLightColor * F_d
 *  - Specular: fresnelCorrection * sampledLightColor * F_s
 *
 * where F_d / F_s are horizon-clipped scalar form factors from Heitz LTC,
 * the LTC matrix for specular is fetched from the standard LTC LUT, and
 * sampledLightColor is read from the screen's render-target texture using
 * the "average direction" UV lookup (Heitz/Dupuy/Hill — section "Textured
 * light sources" of the LTC paper).
 *
 * The Fresnel correction uses Stephen Hill's approximation:
 *   F = specularColor * t2.x + (specularF90 - specularColor) * t2.y
 */

import {
  cameraPosition,
  Fn,
  float,
  mat3,
  max,
  mix,
  normalWorld,
  positionWorld,
  saturate,
  smoothstep,
  texture,
  vec2,
  vec3,
} from "three/tsl";

import { LTC_Evaluate, LTC_Evaluate_WithLookupDir, LTC_Uv } from "./ltc.js";

/**
 * @param {object} args
 * @param {object} args.corners          { p0, p1, p2, p3 } - uniform vec3 nodes, world-space quad corners (CCW from the front face)
 * @param {THREE.Texture} args.ltcTex1   LTC LUT 1 (matrix Minv coefficients)
 * @param {THREE.Texture} args.ltcTex2   LTC LUT 2 (Fresnel + magnitude)
 * @param {*} args.lightTextureNode      TSL texture node holding the screen
 *                                       color. Passed as a node (not a raw
 *                                       texture) so its `.value` can be
 *                                       swapped when the screen render
 *                                       target is recreated on resize.
 * @param {*} args.intensity             uniform float node
 * @param {*} args.color                 uniform vec3 node, tints the light
 * @param {*} args.diffuseColor          vec3 node (typically baseColor * (1 - metalness))
 * @param {*} args.F0                    vec3 node (typically mix(0.04, baseColor, metalness))
 * @param {*} args.roughness             float node
 * @param {*} [args.blurredLightNode]    Optional pre-filtered (Gaussian-
 *                                       blurred) light texture node. When
 *                                       provided together with `blur`, the
 *                                       node samples a mix of the sharp
 *                                       lookup and this blurred version so
 *                                       surfaces read as a soft uniform
 *                                       glow instead of a literal mirror.
 * @param {*} [args.blur]                Optional float node in roughly
 *                                       [0, 4]. 0 = pure sharp lookup,
 *                                       4+ = fully pre-blurred. Linear
 *                                       mix in between.
 * @param {*} [args.normalNode]          Optional world-space normal override
 *                                       (e.g. an instanced varying). Defaults
 *                                       to `normalWorld`.
 */
export function screenLightNode({
  corners,
  ltcTex1,
  ltcTex2,
  lightTextureNode,
  blurredLightNode = null,
  intensity,
  color,
  diffuseColor,
  F0,
  roughness,
  blur = null,
  normalNode = null,
}) {
  const { p0, p1, p2, p3 } = corners;

  return Fn(() => {
    const N = normalNode ?? normalWorld;
    const V = cameraPosition.sub(positionWorld).normalize();
    const P = positionWorld;

    const uvLut = LTC_Uv({ N, V, roughness });
    const t1 = texture(ltcTex1, uvLut).toVar();
    const t2 = texture(ltcTex2, uvLut).toVar();

    const mInv = mat3(
      vec3(t1.x, 0, t1.y),
      vec3(0, 1, 0),
      vec3(t1.z, 0, t1.w)
    ).toVar();

    const diffEval = LTC_Evaluate_WithLookupDir({
      N,
      V,
      P,
      p0,
      p1,
      p2,
      p3,
    }).toVar();
    const diffuseFF = diffEval.w;
    const ffWorld = diffEval.xyz;

    const specEval = LTC_Evaluate({ N, V, P, mInv, p0, p1, p2, p3 }).toVar();
    const specularFF = specEval.x;

    const F90 = float(1.0);
    const fresnel = F0.mul(t2.x).add(F90.sub(F0).mul(t2.y)).toVar();

    const ffLenSq = ffWorld.dot(ffWorld);
    const lookupDir = ffWorld.mul(ffLenSq.add(1e-8).inverseSqrt()).toVar();

    const v1d = p1.sub(p0).toVar();
    const v2d = p3.sub(p0).toVar();
    const planeOrtho = v1d.cross(v2d).toVar();

    const denomRaw = planeOrtho.dot(lookupDir).toVar();
    const denom = denomRaw
      .abs()
      .max(1e-6)
      .mul(denomRaw.add(1e-12).sign())
      .toVar();
    const tIntersect = planeOrtho.dot(p0.sub(P)).div(denom).toVar();

    const Q = P.add(lookupDir.mul(tIntersect)).sub(p0);

    const dotV1V2 = v1d.dot(v2d).toVar();
    const invDotV1V1 = float(1.0)
      .div(max(v1d.dot(v1d), 1e-8))
      .toVar();
    const v2Ortho = v2d.sub(v1d.mul(dotV1V2).mul(invDotV1V1)).toVar();

    const uvY = v2Ortho.dot(Q).div(max(v2Ortho.dot(v2Ortho), 1e-8));
    const uvX = v1d
      .dot(Q)
      .mul(invDotV1V1)
      .sub(dotV1V2.mul(invDotV1V1).mul(uvY));
    const lightUV = vec2(uvX, uvY).clamp(vec2(0), vec2(1)).toVar();

    // The screen content is pre-filtered into a small blurred render
    // target each frame (separable Gaussian, see `ScreenLight`). For the
    // lookup we mix between the sharp screen and that pre-filtered version
    // based on the `blur` knob — a real Gaussian-quality blur regardless of
    // how aggressive the slider is, instead of the sparse-tap ghosting an
    // in-shader kernel would produce.
    const sharp = lightTextureNode.sample(lightUV).rgb;
    const blurred = blurredLightNode
      ? blurredLightNode.sample(lightUV).rgb
      : sharp;
    const blurT = blur ? saturate(blur.mul(0.25)) : float(0);
    const sampled = mix(sharp, blurred, blurT).toVar();

    const edgeMaskX = smoothstep(0.0, 0.02, lightUV.x).mul(
      smoothstep(0.0, 0.02, float(1.0).sub(lightUV.x))
    );
    const edgeMaskY = smoothstep(0.0, 0.02, lightUV.y).mul(
      smoothstep(0.0, 0.02, float(1.0).sub(lightUV.y))
    );
    const lookupValid = tIntersect.greaterThan(0.0).select(1.0, 0.0);

    const incoming = sampled
      .mul(color)
      .mul(intensity)
      .mul(edgeMaskX.mul(edgeMaskY).mul(lookupValid));

    const diffTerm = incoming.mul(diffuseColor).mul(diffuseFF);
    const specTerm = incoming.mul(fresnel).mul(specularFF);

    return diffTerm.add(specTerm);
  })();
}
