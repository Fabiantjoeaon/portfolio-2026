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
 * Creates a rounded rectangle shape
 * @param {number} width - Width of rectangle
 * @param {number} height - Height of rectangle
 * @param {number} radius - Corner radius
 * @returns {THREE.Shape}
 */
function createRoundedRectShape(width, height, radius) {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);

  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hh - r);
  shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hh);
  shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hh + r);
  shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);

  return shape;
}

/**
 * Creates the geometry for a single tile (rounded rectangle with depth)
 * @param {number} size - Size of the tile (width = height)
 * @param {number} radius - Corner radius
 * @param {number} depth - Extrusion depth (z-axis thickness)
 * @param {number} segments - Curve segments for corners
 * @param {Object} bevelOptions - Bevel configuration
 * @returns {THREE.ExtrudeGeometry}
 */
export function createTileGeometry(
  size = 1,
  radius = 0.1,
  depth = 0.1,
  segments = 4,
  bevelOptions = {}
) {
  const shape = createRoundedRectShape(size, size, radius);

  const extrudeSettings = {
    depth: depth,
    bevelEnabled: bevelOptions.enabled ?? true,
    bevelThickness: bevelOptions.thickness ?? depth * 0.15,
    bevelSize: bevelOptions.size ?? depth * 0.1,
    bevelOffset: bevelOptions.offset ?? 0,
    bevelSegments: bevelOptions.segments ?? 2,
    curveSegments: segments,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Center the geometry along z-axis so it extrudes equally front/back
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();

  return geometry;
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

  // Refraction displacement (old: refract(vEye, vNormal, 1/1.31) + uv nudge).
  // Geometry is rendered BackSide so geometric normals face away from the
  // camera; negate to match the old front-facing convention. The offset is
  // scaled down: raw refract xy on bevel faces displaces across half the
  // screen and smears the texture into long streaks.
  const refractStrength = options.refractStrength ?? 0.15;
  const refr = refract(
    positionViewDirection.negate(),
    normalView.negate(),
    float(1 / 1.31)
  );
  const stRefracted = viewportUV
    .add(refr.xy.mul(refractStrength))
    .add(vec2(0.01, -0.05))
    .sub(0.5)
    .div(1.01)
    .add(0.5);

  // Noise morph (old morphUV: cnoise of world position warps the UV scale).
  // Clamped away from zero so the division can't blow up the UVs.
  const noise = mx_noise_float(positionWorld.mul(0.02));
  const morphScale = max(float(1.0).add(noise.mul(4.5)), 0.3);
  const stMorphed = stRefracted.sub(0.5).div(morphScale).add(0.5);
  const st = mix(stRefracted, stMorphed, 0.05);

  // RGB shift: three taps offset along the direction from a fixed origin
  const shiftDir = st.sub(vec2(0.2, 0.2));
  const shift = normalize(shiftDir)
    .mul(length(shiftDir).mul(0.01))
    .mul(rand);
  const s1 = screenTex.sample(st.sub(shift));
  const s2 = screenTex.sample(st);
  const s3 = screenTex.sample(st.add(shift));
  const scene = vec3(s1.r, s2.g, s3.b);

  // Fresnel composite (old: glass * fresnel mixed with iridescent boost)
  const fresnel = abs(dot(normalView, positionViewDirection));
  const glass = scene.mul(fresnel);
  // Active ("project") tiles glow constantly and brighter (old: irid x100, a = 1)
  const irid = scene.mul(mix(float(10.0), float(100.0), active));
  const flicker = clamp(sin(time.mul(rand).mul(1.8)), 0.0, 1.0);
  const a = clamp(flicker.add(active), 0.0, 1.0);
  const finalFresnel = mix(irid, glass, pow(fresnel, 2.0));
  material.emissiveNode = clamp(
    mix(glass, finalFresnel, a.add(influence)),
    0.0,
    1.0
  );

  // Material settings - BackSide because geometry faces away from camera
  material.side = THREE.BackSide;

  return material;
}
