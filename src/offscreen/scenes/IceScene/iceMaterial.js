import { Color, MeshStandardNodeMaterial, RepeatWrapping, NoColorSpace, SRGBColorSpace } from "three/webgpu";
import {
  blendOverlay, normalMap, parallaxUV,
  texture, uniform, uv, vec2, vec3, normalWorld,
} from "three/tsl";

/** Shared floor/wall ice, using the three.js webgpu_parallax_uv example:
 * displacement offsets one buried texture, overlaid with the surface layer.
 * No raymarch, transmission pass, refracted-ray calculation or clearcoat.
 * Keeping it opaque preserves scene depth and the tile compositor.
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
  };
  const st = uv().mul(controls.uvScale);
  const sample = (map, coord, fallback) => map ? texture(map, coord) : fallback;
  const relief = sample(iceDisplacement, st, vec3(0.5)).r;
  const surfaceNormal = sample(iceNormal, st, vec3(0.5, 0.5, 1));
  const buriedUV = parallaxUV(st, relief.mul(controls.parallaxScale));
  const buried = sample(iceBottom, buriedUV, vec3(0.4));
  const surface = sample(iceColor, st, vec3(0.5));
  const ice = blendOverlay(surface.rgb, buried.rgb);
  material.colorNode = ice.mul(controls.tint).mul(controls.colorIntensity);
  material.roughnessNode = sample(iceRoughness, st, vec3(0.4)).r
    .mul(controls.roughnessScale)
    .add(controls.roughnessBias);
  material.normalNode = normalMap(surfaceNormal, vec2(controls.normalScale));
  material.emissiveNode = vec3(0);

  if (screenLight) {
    const lighting = {
      baseColor: material.colorNode,
      roughness: material.roughnessNode,
      normalNode: normalWorld,
    };
    screenLight.applyTo(material, lighting);
    screenLight.applyTo(material, { ...lighting, side: "back" });
  }
  return { material, controls, surfaceNormal };
}
