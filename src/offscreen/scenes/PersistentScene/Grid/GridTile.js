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
  viewportMipTexture,
  instanceIndex,
  hash,
  time,
  float,
  uint,
  vec2,
  vec3,
  vec4,
  clamp,
  sin,
  abs,
  dot,
  pow,
  mix,
  step,
  refract,
  normalize,
  length,
  max,
  mx_noise_float,
  uniform,
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
  // Idle drift / hover lift — same z that moves the tile (old vRandOffset)
  const offsetZ = instanceOffset.z.toVarying("v_gridOffsetZ");

  const screenTex = texture(_blackTexture);
  material._screenTextureUniform = screenTex;

  // Per-tile UV offset + scale. `displacement` is 0..1 (1 = previous full
  // intensity). Default is quieter; roughly a third of tiles stay clean.
  const displacement = uniform(options.displacement ?? 0.22);
  const disp = vec4(
    hash(instanceIndex.add(uint(13))).sub(0.5).mul(displacement).mul(0.1),
    hash(instanceIndex.add(uint(47))).sub(0.5).mul(displacement).mul(0.1),
    hash(instanceIndex.add(uint(83))).sub(0.5).mul(displacement).mul(0.45).add(1.0),
    step(0.35, hash(instanceIndex.add(uint(31))))
  ).toVarying("v_gridDisp");
  material._displacement = displacement;

  const displaceUV = (uvNode) => {
    const warped = uvNode.sub(0.5).div(disp.z).add(0.5).add(disp.xy);
    return mix(uvNode, warped, disp.w);
  };

  // The transmission backdrop refracts the composited scene via a viewport
  // snapshot; wrapping its sample() applies the same per-tile displacement
  // to the scene behind the tiles, not just the screen texture.
  const backdropBuffer = viewportMipTexture();
  const backdropSample = backdropBuffer.sample.bind(backdropBuffer);
  backdropBuffer.sample = (uvNode) => backdropSample(displaceUV(uvNode));
  material.viewportBuffer = backdropBuffer;

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
  const st = displaceUV(mix(stRefracted, stMorphed, 0.05));

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
  const facing = abs(dot(normalView, positionViewDirection));
  const glass = scene.mul(facing);
  const irid = scene.mul(mix(float(4.0), float(12.0), active));
  const flicker = clamp(sin(time.mul(rand).mul(1.8)), 0.0, 1.0);
  const a = clamp(flicker.add(active), 0.0, 1.0);
  const finalFresnel = mix(irid, glass, pow(facing, 2.0));
  const accent = clamp(
    finalFresnel.mul(clamp(a.mul(0.35).add(influence), 0.0, 1.0)),
    0.0,
    1.0
  );

  // Grazing-angle rim, gated by how far the tile has come toward the camera
  // (old: a = clamp(vRandOffset * 1.25, 0, 1)). Idle peak is ~0.5.
  const zFresnel = clamp(offsetZ.mul(2.0), 0.0, 1.0);
  const rim = pow(float(1.0).sub(facing), 2.5).mul(0.1).mul(zFresnel);
  material.emissiveNode = clamp(accent.add(rim), 0.0, 1.0);

  material.side = THREE.FrontSide;

  return material;
}
