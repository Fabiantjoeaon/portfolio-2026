import * as THREE from "three/webgpu";
import {
  attribute,
  positionLocal,
  normalLocal,
  positionWorld,
  transformNormalToView,
  positionViewDirection,
  texture,
  viewportUV,
  instanceIndex,
  hash,
  time,
  float,
  vec2,
  vec3,
  clamp,
  sin,
  abs,
  dot,
  pow,
  mix,
  refract,
  normalize,
  length,
  max,
  mx_noise_float,
} from "three/tsl";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { MeshTransmissionNodeMaterial } from "three-blocks/transmission";
import { rotateByQuat } from "./GridCompute.js";

// Placeholder until Grid.setScreenTexture wires the real screen render target
const _blackTexture = new THREE.DataTexture(
  new Uint8Array([0, 0, 0, 255]),
  1,
  1
);
_blackTexture.needsUpdate = true;

/**
 * Same tile as the old Wall: RoundedBoxGeometry(size, size, size * 0.2, 1)
 * with default radius 0.1 (clamped to half-depth, so the thin edges are fully
 * rounded).
 */
export function createTileGeometry(
  size = 1,
  radius = 0.1,
  depth = 0.2,
  segments = 1
) {
  return new RoundedBoxGeometry(size, size, depth, segments, radius);
}

/**
 * Creates a glass tile material using MeshTransmissionNodeMaterial.
 * Extended with instanced positioning support for GPU-driven grid.
 *
 * @param {Object} options - Material options
 * @returns {MeshTransmissionNodeMaterial}
 */
export function createTileMaterial(options = {}) {
  // Create transmission material like the demo scene cube
  const material = new MeshTransmissionNodeMaterial({
    ditherStrength: 0,
  });
  material.name = "GridTileTransmission";

  // RGB shift from the old glassRefract (per-channel dispersion)
  material.chromaticAberration = options.chromaticAberration ?? 0.15;

  // Instance attributes for GPU-driven grid positioning, packed to stay
  // under WebGPU's 8 vertex buffer limit (see GridCompute._createBuffers)
  const instancePosition = attribute("instancePosition", "vec3");
  const instanceOffset = attribute("instanceOffset", "vec4"); // xyz offset, w scale
  const instanceRotation = attribute("instanceRotation", "vec4");
  const instanceInfluence = attribute("instanceInfluence", "vec4"); // x influence, z active

  // Position: scale, rotate by the compute-driven quaternion, then translate
  const rotatedPos = rotateByQuat(
    positionLocal.mul(instanceOffset.w),
    instanceRotation
  );
  material.positionNode = rotatedPos
    .add(instancePosition)
    .add(instanceOffset.xyz);

  // Rotate normals with the same quaternion so lighting/refraction follow
  const normalView = transformNormalToView(
    rotateByQuat(normalLocal, instanceRotation)
  )
    .toVarying("v_gridNormalView")
    .normalize();
  material.normalNode = normalView;

  // glassRefract port from the old Wall shader: sample the screen texture
  // behind the grid with refraction-displaced UVs, noise morph and RGB split
  const influence = instanceInfluence.x.toVarying("v_gridInfluence");
  const active = instanceInfluence.z.toVarying("v_gridActive");
  const rand = hash(instanceIndex).toVarying("v_gridRand");

  const screenTex = texture(_blackTexture);
  material._screenTextureUniform = screenTex;

  // Refraction displacement (old: refract(vEye, vNormal, 1/1.31)).
  // Incident vector is camera → fragment (vEye); normals face the camera.
  const refractStrength = options.refractStrength ?? 0.15;
  const refr = refract(
    positionViewDirection.negate(),
    normalView,
    float(1 / 1.31)
  );
  const stRefracted = viewportUV.add(refr.xy.mul(refractStrength));

  // Noise morph (old morphUV: cnoise of world position warps the UV scale).
  // Clamped away from zero so the division can't blow up the UVs.
  const noise = mx_noise_float(positionWorld.mul(0.02));
  const morphScale = max(float(1.0).add(noise.mul(4.5)), 0.3);
  const stMorphed = stRefracted.sub(0.5).div(morphScale).add(0.5);
  const st = mix(stRefracted, stMorphed, 0.05);

  // RGB shift: three taps offset along the direction from a fixed origin.
  // The transmission backdrop already refracts the composited scene (with
  // transitions) via its shared viewport snapshot, so the shimmer accents
  // sample the cheap screen texture instead of paying for a second
  // full-screen framebuffer copy each frame.
  const shiftDir = st.sub(vec2(0.2, 0.2));
  const shift = normalize(shiftDir)
    .mul(length(shiftDir).mul(0.01))
    .mul(rand);
  const s1 = screenTex.sample(st.sub(shift));
  const s2 = screenTex.sample(st);
  const s3 = screenTex.sample(st.add(shift));
  const scene = vec3(s1.r, s2.g, s3.b);

  // Accent-only emissive: zero at rest (the transmission shows the backdrop
  // as clear glass), iridescent shimmer on flicker, hover influence and
  // active ("project") tiles. Re-adding the backdrop here would double the
  // brightness and wash the tiles white.
  const fresnel = abs(dot(normalView, positionViewDirection));
  const glass = scene.mul(fresnel);
  const irid = scene.mul(mix(float(4.0), float(12.0), active));
  const flicker = clamp(sin(time.mul(rand).mul(1.8)), 0.0, 1.0);
  const a = clamp(flicker.add(active), 0.0, 1.0);
  const finalFresnel = mix(irid, glass, pow(fresnel, 2.0));
  material.emissiveNode = clamp(
    finalFresnel.mul(clamp(a.mul(0.35).add(influence), 0.0, 1.0)),
    0.0,
    1.0
  );

  material.side = THREE.FrontSide;

  return material;
}
