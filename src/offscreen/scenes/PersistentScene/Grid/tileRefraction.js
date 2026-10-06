import {
  Fn, If, attribute, cameraPosition, cameraProjectionMatrix, cameraViewMatrix,
  diffuseColor, float, materialMetalness, maxMipLevel, mix, modelWorldMatrix,
  modelWorldMatrixInverse, positionWorld, pow, reflect, refract, smoothstep, step,
  specularColor, vec3, vec4, viewportUV,
} from "three/tsl";
import { rotateByQuat } from "./GridCompute.js";

// Below this blur level the next mip adds barely visible softening, so the
// backdrop is read at full resolution and its mip chain isn't rebuilt per frame.
export const BACKDROP_MIP_LEVEL = 0.25;
export const backdropMipLevel = (roughness) => roughness * roughness * 8;

// A box exit is three divisions rather than a ray march or a back-face pass.
// Rounded bevels use their real entry normal and a planar interior boundary.
function boxExit(origin, direction, half) {
  // TSL select() takes a scalar condition; a bvec3 would flip all axes on x.
  const dir = step(0, direction).mul(2).sub(1).mul(direction.abs().max(1e-5));
  const distances = half.mul(dir.sign()).sub(origin).div(dir);
  const travel = distances.x.min(distances.y).min(distances.z).max(0);
  const hit = origin.add(direction.mul(travel));
  const axis = hit.div(half).abs();
  const normal = axis.x.greaterThanEqual(axis.y).and(axis.x.greaterThanEqual(axis.z))
    .select(vec3(dir.x.sign(), 0, 0), axis.y.greaterThanEqual(axis.z)
      .select(vec3(0, dir.y.sign(), 0), vec3(0, 0, dir.z.sign())));
  return { hit, normal, travel };
}

/** Bounded tile optics using the existing Three Blocks HDR viewport snapshot.
 * One transmitted lookup (three with dispersion), plus one optional internal
 * reflection. All expensive work is absent when enhanced glass is disabled.
 */
export function tileRefraction({ buffer, rotation, scale, half, ior, roughness,
  distance, dispersion, innerAmount, internal }) {
  // positionLocal has already been displaced by positionNode in the fragment
  // stage. The slab needs the untouched geometry coordinates instead.
  const entry = attribute("position", "vec3").toVarying("v_glassEntry");
  const normal = attribute("normal", "vec3").toVarying("v_glassNormal").normalize();
  const quat = rotation.toVarying("v_glassQuat");
  const tileScale = scale.toVarying("v_glassScale").abs().max(0.0001);

  return Fn(() => {
    const inverse = vec4(quat.xyz.negate(), quat.w);
    const incident = rotateByQuat(
      modelWorldMatrixInverse.mul(vec4(positionWorld.sub(cameraPosition), 0)).xyz,
      inverse,
    ).normalize().toVar();
    const n = normal.dot(incident).greaterThan(0).select(normal.negate(), normal);
    const direction = refract(incident, n, float(1).div(ior)).normalize().toVar();
    const exit = boxExit(entry, direction, half);
    const outgoing = refract(direction, exit.normal.negate(), ior).toVar();
    const tir = outgoing.dot(outgoing).lessThan(1e-6);
    // Never normalize the zero vector returned for total internal reflection.
    const exitDirection = outgoing.div(outgoing.length().max(1e-5));
    const worldDir = (dir) => modelWorldMatrix.mul(vec4(rotateByQuat(dir, quat), 0)).xyz;
    const project = (hit, dir) => {
      const worldExit = positionWorld.add(worldDir(hit.sub(entry).mul(tileScale)))
        .add(worldDir(dir).normalize().mul(distance));
      const clip = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(worldExit, 1));
      const projected = clip.xy.div(clip.w.max(0.0001)).mul(0.5).add(0.5).flipY();
      // Fade displacement near screen borders and never sample behind the camera.
      const edge = viewportUV.min(viewportUV.oneMinus());
      const borderFade = smoothstep(0, 0.08, edge.x.min(edge.y)).mul(clip.w.greaterThan(0));
      // Backdrop distance sends bevel rays outside the snapshot. Clamping those
      // UVs paints one border texel across the glass. Shorten only the offsets
      // that would leave the frame; samples already inside are unchanged.
      const delta = projected.sub(viewportUV);
      const span = mix(viewportUV.sub(0.001), float(0.999).sub(viewportUV), step(0, delta));
      const axisFit = span.div(delta.abs().max(1e-5));
      const rawFit = axisFit.x.min(axisFit.y).clamp(0, 1);
      const inside = projected.x.greaterThanEqual(0.001).and(projected.x.lessThanEqual(0.999))
        .and(projected.y.greaterThanEqual(0.001)).and(projected.y.lessThanEqual(0.999));
      // Offsets that still reach the snapshot keep their parallax. Rays that
      // would only land by smearing the border fall back to the backdrop
      // directly behind the pixel.
      const fit = inside.select(float(1), rawFit.mul(smoothstep(0, 0.2, rawFit)));
      return mix(viewportUV, projected, borderFade.mul(fit));
    };
    const uv = project(exit.hit, tir.select(direction, exitDirection)).toVar();
    const level = roughness.mul(roughness).mul(8);
    const mip = level.lessThan(BACKDROP_MIP_LEVEL).select(float(0), level.min(maxMipLevel(buffer)));
    const sample = (coord) => buffer.sample(coord.clamp(0.001, 0.999)).level(mip).rgb;
    const transmitted = vec3(0).toVar();
    If(dispersion.greaterThan(0.0001), () => {
      const split = uv.sub(viewportUV).mul(dispersion.mul(0.035));
      transmitted.assign(vec3(sample(uv.sub(split)).r, sample(uv).g, sample(uv.add(split)).b));
    }).Else(() => {
      transmitted.assign(sample(uv));
    });

    if (internal) {
      const reflected = reflect(direction, exit.normal).normalize();
      const epsilon = half.x.min(half.y).min(half.z).mul(0.001);
      const bounce = boxExit(exit.hit.sub(exit.normal.mul(epsilon)), reflected, half);
      const bounceOut = refract(reflected, bounce.normal.negate(), ior);
      const bounceDir = bounceOut.dot(bounceOut).lessThan(1e-6).select(reflected, bounceOut);
      const reflectedColor = sample(project(bounce.hit, bounceDir));
      const f0 = ior.sub(1).div(ior.add(1)).pow(2);
      const fresnel = f0.add(float(1).sub(f0).mul(pow(float(1).sub(direction.dot(exit.normal).abs()), 5)));
      // Blend energy instead of adding emissive glow. Extra path length
      // gently attenuates the one-bounce approximation.
      const attenuation = float(1).div(float(1).add(bounce.travel.div(half.z.mul(2)).mul(0.08)));
      const weight = tir.select(1, fresnel).mul(innerAmount);
      transmitted.assign(mix(transmitted, reflectedColor.mul(attenuation), weight));
    }

    const facing = n.dot(incident).abs().clamp(0, 1);
    const surfaceFresnel = specularColor.add(vec3(1).sub(specularColor).mul(pow(float(1).sub(facing), 5)));
    return transmitted.mul(diffuseColor.rgb).mul(materialMetalness.oneMinus())
      .mul(surfaceFresnel.oneMinus().clamp(0, 1));
  })();
}
