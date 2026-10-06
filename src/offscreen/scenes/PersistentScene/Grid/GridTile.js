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
  floor,
  select,
  smoothstep,
  reference,
  mx_noise_float,
  uniform,
} from "three/tsl";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { MeshTransmissionNodeMaterial } from "three-blocks/transmission";
import { rotateByQuat, tileHideWave } from "./GridCompute.js";
import { BACKDROP_MIP_LEVEL, backdropMipLevel, tileRefraction } from "./tileRefraction.js";

// The tiles also render inside the water and ice reflection passes. three's
// per-target framebuffer clones share one Source, so each differently sized
// pass resized the others and reallocated their mip chains every frame;
// WebKit frees those lazily and iOS runs out of memory.
class PerTargetViewportMipTexture extends THREE.ViewportTextureNode {
  constructor(...args) {
    super(...args);
    this.roughnessSource = null;
    this._mips = true;
    this._framebuffers = new Set();
  }

  // Mip levels are allocated with each snapshot, so a flip must reallocate them.
  get generateMipmaps() {
    const owner = this.referenceNode ?? this;
    const source = owner.roughnessSource;
    const mips = !source || backdropMipLevel(source.roughness) >= BACKDROP_MIP_LEVEL;
    if (mips !== owner._mips) {
      owner._mips = mips;
      owner.defaultFramebuffer.needsUpdate = true;
      for (const framebuffer of owner._framebuffers) framebuffer.needsUpdate = true;
    }
    return mips;
  }

  set generateMipmaps(_) {}

  getTextureForReference(reference = null) {
    const owner = this.referenceNode ?? this;
    if (reference !== null && !owner._cacheTextures.has(reference)) {
      const framebuffer = owner.defaultFramebuffer.clone();
      framebuffer.source = new THREE.TextureSource({ width: 1, height: 1 });
      owner._cacheTextures.set(reference, framebuffer);
      owner._framebuffers.add(framebuffer);
    }
    return super.getTextureForReference(reference);
  }
}

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
 * In/out dissolve: the tile breaks into square blocks that sweep across it in
 * the wave's direction, with a glowing leading edge. Masked, so hidden blocks
 * cost nothing and never reach the transmission snapshot.
 */
// The last block's gap only reaches 0, so it would linger until the whole
// grid hides; fade what's left on the way out and drop it at the wave's end.
function hideFade(h, wave) {
  return select(h.hideDirection.greaterThan(0), smoothstep(h.hideFade, 1, wave), float(0));
}

function tileDissolve(material, h, cols, rows, boxHalf, rand, facing) {
  const wave = tileHideWave(h, instanceIndex, cols, rows).toVarying("v_tileHideWave");
  const local = attribute("position", "vec3").xy.div(boxHalf.xy.mul(2)).add(0.5)
    .toVarying("v_tileLocal").clamp(0, 0.999);
  const cell = floor(local.mul(h.dissolveCells));
  const noise = hash(uint(cell.x.add(cell.y.mul(61)).add(rand.mul(4093))));
  const across = cell.div(h.dissolveCells.sub(1).max(1));
  const sweep = across.x.add(float(1).sub(across.y)).mul(0.5);
  const order = mix(noise, select(h.hideDirection.greaterThan(0), sweep, float(1).sub(sweep)), h.dissolveSweep);
  const amount = clamp(wave.sub(h.dissolveStart).div(float(1).sub(h.dissolveStart).max(0.01)), 0, 1)
    .mul(h.dissolveEdge.add(1));
  const gap = order.add(h.dissolveEdge).sub(amount);
  const fade = hideFade(h, wave);
  material.maskNode = gap.greaterThanEqual(0).or(amount.lessThanEqual(0)).and(fade.lessThan(1));
  const edge = float(1).sub(smoothstep(0, h.dissolveEdge.max(0.001), gap)).mul(step(0.0001, amount));
  return {
    glow: vec3(h.dissolveColor).mul(edge.mul(h.dissolveGlow)),
    flash: pow(float(1).sub(facing), 2).mul(sin(wave.mul(Math.PI))).mul(h.hideFlash),
    visible: fade.oneMinus(),
  };
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
  const enhanced = options.enhancedGlassEnabled ?? true;
  if (enhanced) {
    material.ior = options.glassIOR ?? 1.5;
    material.roughness = options.glassRoughness ?? 0.12;
    material.backdropDistance = options.glassDistance ?? 3;
  }

  // RGB shift from the old glassRefract (per-channel dispersion)
  material.chromaticAberration = options.chromaticAberration ?? 0.15;

  // Instance attributes for GPU-driven grid positioning, packed to stay
  // under WebGPU's 8 vertex buffer limit (see GridCompute._createBuffers)
  const instancePosition = attribute("instancePosition", "vec3");
  const instanceOffset = attribute("instanceOffset", "vec4"); // xyz offset, w scale
  const instanceRotation = attribute("instanceRotation", "vec4");
  const instanceInfluence = attribute("instanceInfluence", "vec4"); // x influence, z active

  // Position: scale, rotate by the compute-driven quaternion, then translate.
  // The emissive fades on the way out, but the glass keeps refracting, so it shrinks too.
  const shrink = options.hide
    ? hideFade(options.hide, tileHideWave(options.hide, instanceIndex, options.cols, options.rows)).oneMinus()
    : float(1);
  const rotatedPos = rotateByQuat(
    positionLocal.mul(instanceOffset.w.mul(shrink)),
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
  const offsetZ = instanceOffset.z.toVarying("v_gridOffsetZ");

  const screenTex = texture(_blackTexture);
  material._screenTextureUniform = screenTex;

  // Per-tile UV offset + scale. `displacement` is 0..1 (1 = previous full
  // intensity). Default is quieter; roughly a third of tiles stay clean.
  const fresnelIntensity =
    options.fresnelIntensityUniform ??
    uniform(options.fresnelIntensity ?? 0.1);
  const fresnelIdle =
    options.fresnelIdleUniform ?? uniform(options.fresnelIdle ?? 1.0);
  const activeTileColor =
    options.activeTileColorUniform ??
    uniform(new THREE.Color(options.activeTileColor ?? 0x6a9cbf));
  const activeTileColorAmount =
    options.activeTileColorAmountUniform ??
    uniform(options.activeTileColorAmount ?? 0.45);
  // Internal refraction shares the transmission snapshot (no extra pass).
  const innerRefract =
    options.innerRefractUniform ?? uniform(options.innerRefract ?? 0.6);
  const boxHalf =
    options.boxHalfUniform ?? uniform(new THREE.Vector3(0.5, 0.5, 0.1));

  const displacement =
    options.displacementUniform ?? uniform(options.displacement ?? 0.22);
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
  const backdropBuffer = new PerTargetViewportMipTexture();
  const backdropSample = backdropBuffer.sample.bind(backdropBuffer);
  backdropBuffer.sample = (uvNode) => backdropSample(displaceUV(uvNode));
  material.viewportBuffer = backdropBuffer;

  // Refraction displacement (old: refract(vEye, vNormal, 1/1.31)).
  // Incident vector is camera → fragment (vEye); normals face the camera.
  const refractStrength =
    options.refractStrengthUniform ?? uniform(options.refractStrength ?? 0.15);
  const refr = refract(
    positionViewDirection.negate(),
    normalView,
    float(1 / 1.31)
  );
  const stRefracted = viewportUV.add(refr.xy.mul(refractStrength));

  // Noise morph (old morphUV: cnoise of world position warps the UV scale).
  // Clamped away from zero so the division can't blow up the UVs.
  const noise = mx_noise_float(positionWorld.mul(0.02)).toVarying("v_tileMorph");
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
  // The refraction offset reaches past the screen plane's hard border; fade
  // toward it so the edge doesn't cut a seam through the tiles.
  const screenRect =
    options.screenRectUniform ?? uniform(new THREE.Vector4(0, 0, 1, 1));
  const inRect = smoothstep(0, 0.06, st.sub(screenRect.xy))
    .mul(smoothstep(0, 0.06, screenRect.zw.sub(st)));
  const sceneRaw = vec3(s1.r, s2.g, s3.b).mul(inRect.x.mul(inRect.y));
  const activeMix = active.mul(activeTileColorAmount);
  const scene = mix(
    sceneRaw,
    mix(sceneRaw, vec3(activeTileColor), float(0.6)),
    activeMix
  );

  if (enhanced) {
    backdropBuffer.roughnessSource = material;
    material.backdropNode = tileRefraction({
      buffer: backdropBuffer,
      rotation: instanceRotation,
      scale: instanceOffset.w,
      half: boxHalf,
      ior: reference("ior", "float", material),
      roughness: reference("roughness", "float", material),
      distance: reference("backdropDistance", "float", material),
      dispersion: reference("chromaticAberration", "float", material),
      innerAmount: innerRefract,
      internal: options.innerRefractEnabled ?? true,
    });
  }

  // Accent-only emissive: zero at rest (the transmission shows the backdrop
  // as clear glass), iridescent shimmer on flicker, hover influence and
  // active ("project") tiles. Re-adding the backdrop here would double the
  // brightness and wash the tiles white.
  const facing = abs(dot(normalView, positionViewDirection));
  const glass = scene.mul(facing);
  const irid = scene.mul(mix(float(4.0), float(18.0), active));
  const flicker = clamp(sin(time.mul(rand).mul(1.8)), 0.0, 1.0);
  const a = clamp(flicker.add(active.mul(1.4)), 0.0, 1.0);
  const finalFresnel = mix(irid, glass, pow(facing, 2.0));
  const accent = clamp(
    finalFresnel.mul(clamp(a.mul(0.4).add(influence).add(active.mul(0.35)), 0.0, 1.0)),
    0.0,
    1.0
  );

  // Grazing-angle rim. fresnelIdle 0 = always on, 1 = gated by idle drift.
  const idleAmt = clamp(offsetZ.mul(2.0), 0.0, 1.0);
  const rim = pow(float(1.0).sub(facing), 2.5)
    .mul(fresnelIntensity)
    .mul(mix(float(1.0), idleAmt, fresnelIdle));
  const activeRim = pow(float(1.0).sub(facing), 1.4).mul(0.28).mul(active);
  const activeGlow = vec3(activeTileColor).mul(activeMix).mul(0.35);
  const { glow, flash, visible } = options.hide
    ? tileDissolve(material, options.hide, options.cols, options.rows, boxHalf, rand, facing)
    : { glow: vec3(0), flash: float(0), visible: float(1) };
  material.emissiveNode = clamp(
    accent.add(rim).add(activeRim).add(activeGlow).add(flash),
    0.0,
    1.0
  ).add(glow).mul(visible);

  material.side = THREE.FrontSide;
  material.uniforms = {
    displacement,
    refractStrength,
    fresnelIntensity,
    fresnelIdle,
    activeTileColor,
    activeTileColorAmount,
    innerRefract,
    boxHalf,
  };

  return material;
}
