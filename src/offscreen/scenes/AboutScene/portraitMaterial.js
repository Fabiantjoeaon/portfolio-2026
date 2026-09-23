import * as THREE from "three/webgpu";
import {
  Fn, cameraViewMatrix, float, floor, fract, instancedBufferAttribute, mix,
  modelNormalMatrix, modelWorldMatrix, mx_noise_vec3, normalize,
  screenCoordinate, sin, smoothstep, step, uv, varying, vec3, vec4,
} from "three/tsl";

const hash = (value) => fract(sin(value.mul(127.1).add(311.7)).mul(43758.5453));

/** Adapted from the avatar pass (program 08) in the supplied frame capture.
 * Native instanced attributes replace its position/normal data textures.
 * A radial halo approximates its convolution bloom locally, so the About
 * typography and other scenes don't acquire the avatar's glow.
 */
export function createPortraitMaterial({ positions, normals, luminances, aspect, depthBounds, uniforms: u, time, reveal, lightPosition, worldScale }) {
  const pos = instancedBufferAttribute(new THREE.InstancedBufferAttribute(positions, 3));
  const normal = instancedBufferAttribute(new THREE.InstancedBufferAttribute(normals, 3));
  const luma = instancedBufferAttribute(new THREE.InstancedBufferAttribute(luminances, 1));
  const seed = hash(pos.dot(vec3(127.1, 311.7, 74.7)));
  const height = pos.y.add(0.5).clamp(0, 1);
  const show = smoothstep(
    seed.mul(0.2).add(height.mul(0.4)),
    hash(seed).mul(0.2).add(height.mul(0.4)).add(0.4),
    reveal,
  );
  const sourceDepth = pos.z.sub(depthBounds[0]).div(Math.max(depthBounds[1] - depthBounds[0], 0.001));
  const blur = sourceDepth.sub(u.portraitFocus).abs()
    .div(u.portraitFocusWidth).clamp(0, 1).mul(u.portraitDepthBlur)
    .mul(float(2).sub(show)).clamp(0, 1);

  // Whole horizontal bands move together, rather than independent jitter.
  const glitchTick = floor(time.mul(u.portraitGlitchSpeed));
  const band = floor(pos.y.mul(24).add(sin(pos.y.mul(3).add(glitchTick))));
  const glitchSeed = hash(band.add(glitchTick.mul(17)));
  const glitch = step(float(1).sub(u.portraitGlitchFrequency), glitchSeed)
    .mul(hash(band.add(glitchTick))).mul(u.portraitGlitchAmount);

  const material = new THREE.PointsNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
    alphaToCoverage: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  material.name = "Holographic portrait";
  material.positionNode = Fn(() => {
    const phase = time.mul(u.portraitMotionSpeed).add(seed.mul(Math.PI * 2));
    const drift = vec3(sin(phase), sin(phase.mul(0.73).add(2)), sin(phase.mul(0.57).add(4)))
      .mul(u.portraitMotionAmount);
    const scatter = mx_noise_vec3(pos.mul(8).add(vec3(0, time.mul(0.3), time.mul(0.2))))
      .mul(0.15).add(vec3(height.mul(0.15), 0, -0.2))
      .mul(float(1).sub(show)).mul(u.portraitRevealScatter);
    return vec3(pos.xy, pos.z.mul(u.portraitDepth)).add(drift).add(scatter)
      .add(vec3(glitch.mul(sin(band.add(glitchTick))), 0, 0));
  })();

  const worldNormal = normalize(modelNormalMatrix.mul(normal));
  const viewNormal = normalize(cameraViewMatrix.mul(vec4(worldNormal, 0)).xyz);
  const front = smoothstep(-0.2, 0, viewNormal.z);
  const worldPos = modelWorldMatrix.mul(vec4(material.positionNode, 1)).xyz;
  const toLight = lightPosition.sub(worldPos);
  const diffuse = smoothstep(0.35, 1, worldNormal.dot(normalize(toLight)));
  const attenuation = toLight.length().div(worldScale.max(0.001)).mul(0.5).max(0.25).sqrt().reciprocal();
  const brightness = luma.clamp(0, 1).pow(u.portraitGamma);
  const rim = float(1).sub(viewNormal.z.abs()).pow(2);
  const shade = varying(
    brightness.mul(u.portraitAmbient.add(diffuse.mul(attenuation).mul(u.portraitLightStrength)))
      .add(rim.mul(u.portraitRim).mul(brightness))
      .mul(front).mul(show).mul(float(1).sub(blur.mul(0.5))),
  );
  const vBlur = varying(blur);
  const vShow = varying(show);
  const vLuma = varying(brightness);
  const vHeight = varying(pos.y);
  const vEdge = varying(pos.x.div(aspect).abs().mul(2));
  const expansion = float(1).add(blur.pow(1.5).mul(8));
  const energy = varying(expansion.pow(-0.8));
  // A little extra quad area hosts a soft halo around the sharp/defocused dot.
  material.sizeNode = u.portraitPointSize.mul(expansion).mul(u.portraitGlowRadius);

  material.colorNode = Fn(() => {
    const radius = uv().sub(0.5).length().mul(2);
    const dotRadius = radius.mul(u.portraitGlowRadius);
    const feather = dotRadius.fwidth().max(0.01).add(u.portraitSoftness.mul(0.3));
    const core = float(1).sub(dotRadius).div(feather.add(vBlur.mul(5))).clamp(0, 1);
    const halo = radius.mul(radius).mul(-6).exp()
      .mul(float(1).sub(smoothstep(0.65, 1, radius)))
      .mul(u.portraitGlow).div(u.portraitGlowRadius.pow(2));

    const pixel = floor(screenCoordinate.xy.div(u.portraitDitherScale));
    const low = pixel.x.mod(2).mul(2).add(pixel.y.mod(2).mul(3)).mod(4);
    const highPixel = floor(pixel.div(2));
    const high = highPixel.x.mod(2).mul(2).add(highPixel.y.mod(2).mul(3)).mod(4);
    const threshold = low.mul(4).add(high).add(0.5).div(16);
    const dither = mix(float(1), smoothstep(threshold.sub(0.12), threshold.add(0.12), vLuma), u.portraitDither);
    const neck = smoothstep(-0.5, float(-0.499).add(u.portraitNeckFade), vHeight);
    const sides = float(1).sub(smoothstep(float(1).sub(u.portraitEdgeFade).sub(0.001), 1, vEdge));
    const emission = core.mul(dither).add(halo)
      .mul(shade).mul(energy).mul(vShow.pow(2)).mul(neck).mul(sides)
      .mul(u.portraitOpacity).mul(u.portraitExposure);
    const color = mix(u.portraitShadowColor, u.portraitColor, vLuma)
      .mix(u.portraitDefocusColor, vBlur.mul(0.65));
    // ONE + ONE blending: encode opacity in radiance, not only in alpha.
    // This lets soft points accumulate light without occluding one another.
    return vec4(color.mul(emission), emission.mul(float(1).sub(vBlur).pow(3)).clamp(0, 1));
  })();
  return material;
}
