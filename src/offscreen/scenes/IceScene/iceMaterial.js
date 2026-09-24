import { Color, MeshStandardNodeMaterial, RepeatWrapping, NoColorSpace, SRGBColorSpace, Vector2 } from "three/webgpu";
import {
  blendOverlay, normalMap, parallaxUV, Fn, float, mix, reflect,
  cameraPosition, positionWorld, smoothstep,
  texture, uniform, uv, vec2, vec3, normalWorld,
} from "three/tsl";

/** Shared floor/wall ice, using the three.js webgpu_parallax_uv example:
 * displacement offsets one buried texture, overlaid with the surface layer.
 * A normal-distorted buried layer suggests refraction, and cave walls can
 * reflect the screen with one analytic plane intersection. No ray marching
 * or transmission render pass.
 * Depth writes preserve scene depth and the tile compositor, including
 * the cave's narrow coverage blend at the floor.
 * All texture inputs are shared, loader-owned assets; no texture is cloned.
 */
export function createIceMaterial(options) {
  const { iceColor, iceBottom, iceDisplacement, iceNormal, iceRoughness, screenLight } = options;
  for (const map of [iceColor, iceBottom, iceDisplacement, iceNormal, iceRoughness]) {
    if (map) map.wrapS = map.wrapT = RepeatWrapping;
  }
  // The worker's bitmap loader defaults every image to sRGB. Data maps must
  // stay linear or their decoded normals lean sideways and break refraction.
  for (const map of [iceDisplacement, iceNormal, iceRoughness]) {
    if (map) map.colorSpace = NoColorSpace;
  }
  for (const map of [iceColor, iceBottom]) {
    if (map) map.colorSpace = SRGBColorSpace;
  }

  const material = new MeshStandardNodeMaterial();
  material.name = "ParallaxGlacialIce";
  material.metalness = 0;
  const controls = {
    uvScale: uniform(options.uvScale ?? 1),
    parallaxScale: uniform(options.parallaxScale ?? 0.32),
    normalScale: uniform(options.normalScale ?? 0.8),
    colorIntensity: uniform(options.colorIntensity ?? 1),
    tint: uniform(new Color(options.tint ?? 0x28677f)),
    roughnessScale: uniform(options.roughnessScale ?? 0.32),
    roughnessBias: uniform(options.roughnessBias ?? 0.18),
    screenLightScale: uniform(options.screenLightScale ?? 1),
    screenBackLightScale: uniform(options.screenBackLightScale ?? 1),
    refractionDistortion: uniform(options.refractionDistortion ?? 0),
    screenReflectionStrength: uniform(options.screenReflectionStrength ?? 0),
    screenReflectionSpread: uniform(options.screenReflectionSpread ?? 1),
    screenReflectionBounce: uniform(options.screenReflectionBounce ?? 0),
    bodyFill: uniform(options.bodyFill ?? 0),
    trailEnabled: uniform(options.trailEnabled ? 1 : 0),
    trailStrength: uniform(options.trailStrength ?? 0),
    trailColor: uniform(new Color(options.trailColor ?? 0x9beeff)),
    trailRoughness: uniform(options.trailRoughness ?? 0.82),
    trailUvScale: uniform(new Vector2(...(options.trailUvScale ?? [1, 1]))),
    trailUvOffset: uniform(new Vector2(...(options.trailUvOffset ?? [0, 0]))),
  };
  // Cave-only coverage blend. The opaque floor renders first; keep depth
  // writes on for the curved shell and the tile compositor.
  if (options.floorY !== undefined) {
    controls.floorY = uniform(options.floorY);
    controls.floorBlendHeight = uniform(options.floorBlendHeight ?? 2.5);
    material.opacityNode = smoothstep(0, controls.floorBlendHeight.max(0.001), positionWorld.y.sub(controls.floorY));
    material.transparent = true;
    material.depthWrite = true;
  }
  const st = uv().mul(controls.uvScale);
  const sample = (map, coord, fallback) => map ? texture(map, coord) : fallback;
  const relief = sample(iceDisplacement, st, vec3(0.5)).r;
  const surfaceNormal = sample(iceNormal, st, vec3(0.5, 0.5, 1));
  const buriedUV = parallaxUV(st, relief.mul(controls.parallaxScale)).add(
    surfaceNormal.xy.mul(2).sub(1).mul(controls.refractionDistortion),
  );
  const buried = sample(iceBottom, buriedUV, vec3(0.4));
  const surface = sample(iceColor, st, vec3(0.5));
  const ice = blendOverlay(surface.rgb, buried.rgb);
  // Keep a little blue body beneath the dark cracks; an all-black overlay
  // reads as stone and conceals the view-dependent motion of the buried layer.
  let strata = ice.mul(0.85).add(buried.rgb.mul(0.15));
  if (options.innerLayerStrength !== undefined) {
    controls.innerLayerStrength = uniform(options.innerLayerStrength);
    controls.innerLayerDepth = uniform(options.innerLayerDepth ?? 2);
    controls.innerLayerBrightness = uniform(options.innerLayerBrightness ?? 1);
    // The cave needs a readable interior beneath its surface cracks. Two
    // independently displaced layers separate as the viewing angle changes;
    // mixing them through the surface avoids the dark, opaque overlay look.
    // Opt-in keeps the floor's original texture and lighting path unchanged.
    const deepUV = parallaxUV(st, relief.mul(controls.parallaxScale).mul(controls.innerLayerDepth))
      .add(surfaceNormal.xy.mul(2).sub(1).mul(controls.refractionDistortion).mul(0.5))
      .mul(0.73).add(vec2(0.17, 0.29));
    const deep = sample(iceBottom, deepUV, vec3(0.4));
    const interior = mix(buried.rgb, deep.rgb, 0.45).mul(controls.innerLayerBrightness);
    strata = mix(strata, interior, controls.innerLayerStrength);
  }
  const baseColor = mix(strata, vec3(1), controls.bodyFill)
    .mul(controls.tint).mul(controls.colorIntensity);
  const baseRoughness = sample(iceRoughness, st, vec3(0.4)).r
    .mul(controls.roughnessScale)
    .add(controls.roughnessBias).clamp(0.04, 1);
  const trailTexture = options.trailMap ? texture(options.trailMap) : null;
  const trailMask = trailTexture
    ? trailTexture.sample(uv().mul(controls.trailUvScale).add(controls.trailUvOffset))
      .r.mul(controls.trailEnabled).mul(controls.trailStrength).clamp(0, 1)
    : float(0);
  material.colorNode = mix(baseColor, controls.trailColor, trailMask.mul(0.78));
  material.roughnessNode = mix(baseRoughness, controls.trailRoughness, trailMask);
  material.normalNode = normalMap(surfaceNormal, vec2(controls.normalScale));
  material.emissiveNode = controls.trailColor.mul(trailMask).mul(0.12);

  if (screenLight) {
    const lighting = {
      baseColor: material.colorNode,
      roughness: material.roughnessNode,
      normalNode: normalWorld,
    };
    screenLight.applyTo(material, { ...lighting, intensityScale: controls.screenLightScale });
    screenLight.applyTo(material, { ...lighting, side: "back", intensityScale: controls.screenBackLightScale });
    if (options.screenReflectionStrength !== undefined) {
      material.emissiveNode = material.emissiveNode.add(Fn(() => {
        const { p0, p1, p3 } = screenLight.corners;
        const right = p1.sub(p0);
        const up = p3.sub(p0);
        const planeNormal = right.cross(up).normalize();
        const view = cameraPosition.sub(positionWorld).normalize();
        const ray = reflect(view.negate(), normalWorld);
        const denom = planeNormal.dot(ray);
        const safeDenom = denom.abs().max(0.0001).mul(denom.greaterThanEqual(0).select(1, -1));
        const distance = planeNormal.dot(p0.sub(positionWorld)).div(safeDenom);
        const hit = positionWorld.add(ray.mul(distance)).sub(p0);
        const coord = vec2(hit.dot(right).div(right.dot(right).max(0.001)),
          hit.dot(up).div(up.dot(up).max(0.001)))
          .sub(0.5).div(controls.screenReflectionSpread).add(0.5);
        const edge = smoothstep(0, 0.025, coord).mul(smoothstep(0, 0.025, coord.oneMinus()));
        const valid = distance.greaterThan(0).toFloat().mul(edge.x).mul(edge.y);
        const sampleUV = vec2(coord.x, coord.y.oneMinus()).clamp(0.001, 0.999);
        const sharp = screenLight.lightTextureNode.sample(sampleUV).rgb;
        const soft = screenLight.blurredLightNode.sample(sampleUV).rgb;
        const radiance = mix(sharp, soft, material.roughnessNode.pow(2));
        // A broad secondary screen reflection supplies the rear of the cave,
        // where the primary mirror ray travels away from the screen plane.
        // Project its direction into the screen basis; the normal map still
        // breaks up the image, and roughness softens the secondary bounce.
        const axial = ray.dot(planeNormal).abs().max(0.2);
        const bounceCoord = vec2(
          ray.dot(right.normalize()).div(right.length().div(up.length().max(0.001))),
          ray.dot(up.normalize()).negate(),
        ).div(axial.mul(controls.screenReflectionSpread)).mul(0.5).add(0.5);
        const bounceEdge = smoothstep(0, 0.1, bounceCoord)
          .mul(smoothstep(0, 0.1, bounceCoord.oneMinus()));
        const bounceUV = bounceCoord.clamp(0.001, 0.999);
        const bounce = mix(
          screenLight.lightTextureNode.sample(bounceUV).rgb,
          screenLight.blurredLightNode.sample(bounceUV).rgb,
          material.roughnessNode.pow(2).mul(0.65).add(0.15),
        );
        const behindScreen = smoothstep(0, right.length().max(0.001), planeNormal.dot(p0.sub(positionWorld)));
        const reflection = radiance.mul(valid).add(bounce.mul(bounceEdge.x).mul(bounceEdge.y)
          .mul(behindScreen).mul(controls.screenReflectionBounce));
        const fresnel = float(0.018).add(view.dot(normalWorld).clamp(0, 1).oneMinus().pow(5).mul(0.982));
        return reflection.mul(screenLight.color).mul(screenLight.intensity)
          .mul(fresnel).mul(controls.screenReflectionStrength);
      })());
    }
  }
  return { material, controls, surfaceNormal, trailTexture };
}
