import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  abs,
  attribute,
  cameraPosition,
  cameraProjectionMatrixInverse,
  cameraWorldMatrix,
  clamp,
  exp,
  float,
  fwidth,
  instanceIndex,
  int,
  length,
  log2,
  max,
  min,
  mix,
  normalize,
  positionGeometry,
  pow,
  screenUV,
  select,
  smoothstep,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { travelingGlowField, FLOW_ATLAS_COLS, FLOW_ATLAS_ROWS } from "./CubeWalls.js";
import { rotateByQuat } from "../PersistentScene/Grid/GridCompute.js";
import { VolumetricPass, createMarchMaterial, marchJitter } from "../../postprocessing/volumetrics.js";

const HALF_SQRT = Math.SQRT1_2;
// Compute-pass surface quaternions (back, front, floor, ceil, left, right).
const SURFACE_QUAT = [
  [0, 0, 0, 1],
  [0, 1, 0, 0],
  [-HALF_SQRT, 0, 0, HALF_SQRT],
  [HALF_SQRT, 0, 0, HALF_SQRT],
  [0, HALF_SQRT, 0, HALF_SQRT],
  [0, -HALF_SQRT, 0, HALF_SQRT],
];
// Back, floor and ceiling only; the other tiles stay black so mips don't bleed.
const EMITTERS = [0, 2, 3];
const TILE_EDGE = 0.03;
// Fraction of a step's atlas footprint to prefilter; jitter and the composite blur cover the rest.
const FOOTPRINT = 0.5;

/** Surface extents as nodes, matching CubeWalls' compute layout. */
function surfaceFrame(s, roomSize, keepOut) {
  const extU = s < 4 ? roomSize.x : roomSize.z;
  const extV = s < 2 ? roomSize.y : s < 4 ? roomSize.z : roomSize.y;
  const extN = s < 2 ? roomSize.z : s < 4 ? roomSize.y : roomSize.x;
  return {
    extU: s < 2 ? extU.add(keepOut.mul(2)) : extU,
    extV,
    base: extN.mul(0.5).add(s < 2 || s > 3 ? keepOut : 0),
    col: s % FLOW_ATLAS_COLS,
    row: Math.floor(s / FLOW_ATLAS_COLS),
  };
}

/**
 * CubeShafts - volumetric light from the glow shell, blocked by the cubes.
 *
 * 1. Light atlas: each surface gets a tile (same 3x2 layout as the flow map).
 *    The shell's traveling glow is drawn as the emitter, then every cube's
 *    rounded face is drawn over it in black, straight from the walls' compute
 *    buffers. What survives is the light leaking through the gaps.
 * 2. March: after the scene renders, a reduced-resolution pass walks each view
 *    ray up to the scene depth, so air inside or behind cubes never glows.
 *    Every sample looks back along each wall normal into that wall's tile,
 *    at a mip level that grows with distance, so beams start as sharp slits
 *    at the gaps and soften as they cross the room.
 * 3. `effect` adds the result in the scene post chain.
 */
export class CubeShafts {
  /**
   * @param {Object} options
   * @param {import("./CubeWalls.js").CubeWalls} options.walls
   * @param {Object} options.settings - CubeScene.Shafts param values
   */
  constructor({ walls, settings }) {
    this.walls = walls;
    this.enabled = settings.shaftsEnabled;
    this.resolution = settings.shaftResolution;
    this.uniforms = {
      shaftIntensity: uniform(settings.shaftIntensity),
      shaftThreshold: uniform(settings.shaftThreshold),
      shaftSoftness: uniform(settings.shaftSoftness),
      shaftReach: uniform(settings.shaftReach),
      shaftLength: uniform(settings.shaftLength),
      shaftStart: uniform(settings.shaftStart),
      shaftBlur: uniform(settings.shaftBlur),
      shaftMaxDistance: uniform(settings.shaftMaxDistance),
      shaftSteps: uniform(settings.shaftSteps, "int"),
    };

    const tile = Number(settings.shaftAtlasSize);
    this.atlas = new THREE.RenderTarget(tile * FLOW_ATLAS_COLS, tile * FLOW_ATLAS_ROWS, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this._maxLod = Math.log2(tile);
    this._atlasScene = new THREE.Scene();
    this._createEmitters();
    this._createOccluders();

    this.pass = new VolumetricPass("CubeShafts", this.uniforms.shaftSteps);
    this._variants = new Map();
    this._active = uniform(0);
    this._texel = uniform(new THREE.Vector2(1, 1));
    // Four bilinear taps form a 3x3 tent, which cancels the march jitter.
    this.effect = (color, { uvNode }) => {
      const o = this._texel.mul(0.5);
      const tap = (x, y) => texture(this.pass.target.texture, uvNode.add(vec2(o.x.mul(x), o.y.mul(y)))).rgb;
      const blurred = tap(-1, -1).add(tap(1, -1)).add(tap(-1, 1)).add(tap(1, 1)).mul(0.25);
      return color.add(blurred.mul(this._active));
    };
  }

  /** One quad per surface tile: the shell glow at that tile's world points. */
  _createEmitters() {
    const w = this.walls.uniforms;
    const u = this.uniforms;
    const keepOut = max(w.depthMax.add(w.faceBulge).add(w.cornerInset), 0);
    const quad = new THREE.PlaneGeometry(1, 1);
    this._emitters = SURFACE_QUAT.map((q, s) => {
      const frame = surfaceFrame(s, w.roomSize, keepOut);
      const tuv = positionGeometry.xy.add(0.5);
      // The atlas' y-down mapping flips the quad's winding.
      const material = new THREE.MeshBasicNodeMaterial({
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      material.name = "CubeShaftsEmitter";
      const ax = tuv.x.add(frame.col).div(FLOW_ATLAS_COLS);
      const ay = tuv.y.add(frame.row).div(FLOW_ATLAS_ROWS);
      material.vertexNode = vec4(ax.mul(2).sub(1), ay.mul(-2).add(1), 0, 1);

      const local = vec3(
        tuv.x.sub(0.5).mul(frame.extU),
        tuv.y.sub(0.5).mul(frame.extV),
        frame.base.negate(),
      );
      const world = varying(rotateByQuat(local, vec4(...q)).add(w.roomCenter), "v_shaftShell");
      const field = travelingGlowField(w.glowNoiseScale, w.glowNoiseSpeed, w.time, world);
      const hot = pow(clamp(field, 0, 1), w.glowContrast);
      material.colorNode = EMITTERS.includes(s)
        ? w.glowColor.mul(hot.mul(smoothstep(u.shaftThreshold, u.shaftThreshold.add(u.shaftSoftness), hot)))
        : vec3(0);
      const mesh = new THREE.Mesh(quad, material);
      mesh.frustumCulled = false;
      this._atlasScene.add(mesh);
      return mesh;
    });
    this._emitterGeometry = quad;
  }

  /** Every cube's rounded face, in black, over its surface tile. */
  _createOccluders() {
    const walls = this.walls;
    const w = walls.uniforms;
    const plane = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry().copy(plane);
    plane.dispose();
    geometry.deleteAttribute("normal");
    geometry.deleteAttribute("uv");
    geometry.setAttribute("instancePosGap", walls.posGapBuffer);
    geometry.setAttribute("instanceSize", walls.sizeBuffer);
    geometry.setAttribute("instanceQuat", walls.quatBuffer);
    geometry.instanceCount = walls.count;

    const posGap = attribute("instancePosGap", "vec4");
    const size = attribute("instanceSize", "vec4");
    const quat = attribute("instanceQuat", "vec4");
    const meta = texture(walls.metaTexture, vec2(float(instanceIndex).add(0.5).div(walls.count), 0.5)).level(0);
    const surf = meta.x;

    const keepOut = max(w.depthMax.add(w.faceBulge).add(w.cornerInset), 0);
    const rs = w.roomSize;
    const isCap = surf.lessThan(1.5);
    const isFloorCeil = surf.lessThan(3.5);
    const extU = select(isFloorCeil, rs.x, rs.z).add(select(isCap, keepOut.mul(2), float(0)));
    const extV = select(isCap, rs.y, select(isFloorCeil, rs.z, rs.y));
    const col = surf.mod(FLOW_ATLAS_COLS);
    const row = surf.div(FLOW_ATLAS_COLS).floor();

    // A small pad keeps the anti-aliased rim inside the quad.
    const pad = 0.5;
    const extent = size.xy.add(pad * 2);
    const center = rotateByQuat(posGap.xyz.sub(w.roomCenter), vec4(quat.xyz.negate(), quat.w)).xy;
    const offset = positionGeometry.xy.mul(extent);
    const local = center.add(offset);
    const ax = local.x.div(extU).add(0.5).add(col).div(FLOW_ATLAS_COLS);
    const ay = local.y.div(extV).add(0.5).add(row).div(FLOW_ATLAS_ROWS);

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.name = "CubeShaftsOccluder";
    material.vertexNode = vec4(ax.mul(2).sub(1), ay.mul(-2).add(1), 0, 1);

    const vOffset = varying(offset, "v_shaftOffset");
    const vHalf = varying(size.xy.mul(0.5), "v_shaftHalf");
    const vRadius = varying(mix(w.roundRadiusMin, w.roundRadiusMax, size.w), "v_shaftRadius");
    material.colorNode = vec3(0);
    material.opacityNode = Fn(() => {
      const r = min(vRadius, min(vHalf.x, vHalf.y).mul(0.49));
      const q = abs(vOffset).sub(vHalf).add(r);
      const distance = length(max(q, 0)).add(min(max(q.x, q.y), 0)).sub(r);
      const aa = fwidth(distance).max(1e-4);
      return smoothstep(aa, aa.negate(), distance);
    })();

    this._occluders = new THREE.Mesh(geometry, material);
    this._occluders.frustumCulled = false;
    this._occluders.renderOrder = 1;
    this._atlasScene.add(this._occluders);
  }

  _createMarchMaterial() {
    const u = this.uniforms;
    const w = this.walls.uniforms;
    const atlas = texture(this.atlas.texture);
    const maxLod = this._maxLod;
    const tile = 2 ** maxLod;

    const shafts = Fn(() => {
      const depth = this._depth.sample(screenUV).x;
      const ndc = vec4(screenUV.x.mul(2).sub(1), screenUV.y.oneMinus().mul(2).sub(1), depth, 1);
      const world = cameraWorldMatrix.mul(cameraProjectionMatrixInverse.mul(ndc));
      const toSurface = world.xyz.div(world.w).sub(cameraPosition);
      const surfaceDistance = toSurface.length().max(1e-3);
      const direction = toSurface.div(surfaceDistance).toVar();

      const keepOut = max(w.depthMax.add(w.faceBulge).add(w.cornerInset), 0).toVar();
      const half = w.roomSize.mul(0.5).add(vec3(keepOut, 0, keepOut));
      const safe = (x) => select(abs(x).lessThan(1e-5), float(1e-5), x);
      const inverse = vec3(
        float(1).div(safe(direction.x)),
        float(1).div(safe(direction.y)),
        float(1).div(safe(direction.z)),
      );
      const t1 = w.roomCenter.sub(half).sub(cameraPosition).mul(inverse);
      const t2 = w.roomCenter.add(half).sub(cameraPosition).mul(inverse);
      const tMin = min(t1, t2);
      const tMax = max(t1, t2);
      const tNear = max(max(tMin.x, tMin.y), tMin.z).max(0).toVar();
      const tFar = min(min(tMax.x, tMax.y), tMax.z).min(surfaceDistance)
        .min(tNear.add(u.shaftMaxDistance)).toVar();
      const fadeStart = u.shaftLength.mul(0.6);

      const result = vec3(0).toVar();
      const frames = EMITTERS.map((s) => ({
        conj: vec4(-SURFACE_QUAT[s][0], -SURFACE_QUAT[s][1], -SURFACE_QUAT[s][2], SURFACE_QUAT[s][3]),
        ...surfaceFrame(s, w.roomSize, keepOut),
      }));

      If(tFar.greaterThan(tNear), () => {
        const count = this.pass.steps.clamp(4, 64);
        const stepLength = tFar.sub(tNear).div(float(count)).toVar();
        const jitter = marchJitter().toVar();
        // Prefilter each tile over the distance one step slides across it, so
        // thin gap slits blur instead of aliasing into rings.
        for (const frame of frames) {
          const d = rotateByQuat(direction, frame.conj);
          const texels = vec2(d.x.mul(tile).div(frame.extU), d.y.mul(tile).div(frame.extV)).length();
          frame.stepLod = log2(texels.mul(stepLength).mul(FOOTPRINT).max(1)).toVar();
        }

        Loop({ start: int(0), end: count, type: "int", condition: "<" }, ({ i }) => {
          const p = cameraPosition.add(direction.mul(tNear.add(float(i).add(jitter).mul(stepLength))))
            .sub(w.roomCenter).toVar();
          for (const frame of frames) {
            const local = rotateByQuat(p, frame.conj);
            const distance = local.z.add(frame.base).max(0);
            const tu = local.x.div(frame.extU).add(0.5);
            const tv = local.y.div(frame.extV).add(0.5);
            const inTile = smoothstep(0, TILE_EDGE, tu).mul(smoothstep(0, TILE_EDGE, tu.oneMinus()))
              .mul(smoothstep(0, TILE_EDGE, tv)).mul(smoothstep(0, TILE_EDGE, tv.oneMinus()));
            const uv = vec2(
              tu.clamp(0, 1).add(frame.col).div(FLOW_ATLAS_COLS),
              tv.clamp(0, 1).add(frame.row).div(FLOW_ATLAS_ROWS),
            );
            const lod = log2(distance.mul(u.shaftBlur).add(1)).max(frame.stepLod).min(maxLod);
            const weight = smoothstep(0, u.shaftStart.max(1e-3), distance)
              .mul(exp(distance.div(u.shaftReach).negate()))
              .mul(smoothstep(fadeStart, u.shaftLength, distance).oneMinus())
              .mul(inTile);
            result.addAssign(atlas.sample(uv).level(lod).rgb.mul(weight));
          }
        });
        result.mulAssign(stepLength);
      });
      return result.mul(u.shaftIntensity);
    });

    return createMarchMaterial("CubeShaftsMarch", shafts());
  }

  /** March against this frame's scene depth; call after the scene render. */
  render(renderer, camera, depthTexture) {
    const active = this.enabled && !!depthTexture && this.uniforms.shaftIntensity.value > 0;
    this._active.value = active ? 1 : 0;
    if (!active) return;

    // Scene gbuffers are pooled, so the depth texture (and its MSAA-ness) can change.
    this._depth ??= texture(depthTexture);
    this._depth.value = depthTexture;
    const msaa = depthTexture.renderTarget?.samples > 1;
    let material = this._variants.get(msaa);
    if (!material) this._variants.set(msaa, (material = this._createMarchMaterial()));
    this.pass.material = material;

    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.atlas);
    renderer.render(this._atlasScene, camera);
    renderer.setRenderTarget(previousTarget);
    const { width, height } = depthTexture.image;
    this.pass.render(renderer, camera, width * this.resolution, height * this.resolution);
    this._texel.value.set(1 / this.pass.target.width, 1 / this.pass.target.height);
  }

  dispose() {
    this.atlas.dispose();
    this._emitterGeometry.dispose();
    for (const mesh of this._emitters) mesh.material.dispose();
    // The instance attributes belong to the walls; detach so they survive.
    const occluderGeometry = this._occluders.geometry;
    for (const name of ["instancePosGap", "instanceSize", "instanceQuat"]) occluderGeometry.deleteAttribute(name);
    occluderGeometry.dispose();
    this._occluders.material.dispose();
    for (const material of this._variants.values()) material.dispose();
    this.pass.dispose();
  }
}
