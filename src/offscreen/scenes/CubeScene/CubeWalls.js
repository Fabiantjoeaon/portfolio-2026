import * as THREE from "three/webgpu";
import {
  StorageInstancedBufferAttribute,
  StorageBufferAttribute,
} from "three/webgpu";
import {
  Fn,
  If,
  instanceIndex,
  storage,
  uniform,
  attribute,
  positionLocal,
  positionGeometry,
  normalLocal,
  normalGeometry,
  transformNormalToView,
  float,
  uint,
  vec3,
  vec4,
  vec2,
  sin,
  clamp,
  mix,
  max,
  min,
  select,
  abs,
  pow,
  hash,
  PI2,
  mx_noise_float,
  positionWorld,
  length,
  normalize,
  step,
  dot,
  mod,
  floor,
  texture,
} from "three/tsl";
import { rotateByQuat } from "../PersistentScene/Grid/GridCompute.js";
import { params, paramValues } from "@/offscreen/params";
import { dampFactorNode } from "../../lib/damp.js";

export function travelingGlowField(scale, speed, timeNode) {
  return mx_noise_float(
    positionWorld
      .mul(scale)
      .add(
        vec3(
          timeNode.mul(speed),
          timeNode.mul(speed.mul(-0.56)),
          timeNode.mul(speed.mul(0.69)),
        ),
      ),
  )
    .mul(0.55)
    .add(
      mx_noise_float(
        positionWorld
          .mul(scale.mul(2.286))
          .add(
            vec3(
              timeNode.mul(speed.mul(-1.31)),
              timeNode.mul(speed.mul(0.81)),
              0.0,
            ),
          ),
      ).mul(0.45),
    )
    .mul(0.5)
    .add(0.5);
}

const HALF_SQRT = 0.7071067811865476;

const SURFACE_DIMS = (width, height, depth) => [
  [width, height],
  [width, height],
  [width, depth],
  [width, depth],
  [depth, height],
  [depth, height],
];

// Inverses of the compute pass's per-surface quaternions (back, front,
// floor, ceil, left, right): world offset -> surface-local (u, v, n).
const SURFACE_INVERSE = [
  [0, 0, 0, 1],
  [0, 1, 0, 0],
  [-HALF_SQRT, 0, 0, HALF_SQRT],
  [HALF_SQRT, 0, 0, HALF_SQRT],
  [0, HALF_SQRT, 0, HALF_SQRT],
  [0, -HALF_SQRT, 0, HALF_SQRT],
].map((q) => new THREE.Quaternion(...q).invert());

/** Surfaces sit in a 3x2 atlas of the flow map. Shared by CPU and GPU. */
export const FLOW_ATLAS_COLS = 3;
export const FLOW_ATLAS_ROWS = 2;

const _box = new THREE.Box3();
const _hit = new THREE.Vector3();
const _local = new THREE.Vector3();

/** Power-of-two leaf count so cells stay near `target`×`target` world units. */
function layoutSurface(u, v, target, minDepth, maxDepth) {
  const n = Math.max(1, Math.round((u * v) / (target * target)));
  const treeDepth = Math.min(
    maxDepth,
    Math.max(minDepth, Math.ceil(Math.log2(n))),
  );
  return {
    u,
    v,
    treeDepth,
    leaves: 1 << treeDepth,
    nodes: (1 << treeDepth) - 1,
  };
}

/**
 * CubeWalls - all six surfaces of the room as one instanced mesh.
 *
 * Each surface is a recursive binary subdivision (treemap). Leaf count is
 * chosen from surface area so a wide wall gets more cubes instead of
 * stretching the same set. Splits always cut the longer world-space side,
 * so cells stay close to square while the animated ratios still breathe.
 *
 * A single GPGPU compute pass walks the tree per instance and writes world
 * position, inner cell size, extrusion depth, and a gap-light factor.
 */
export class CubeWalls extends THREE.InstancedMesh {
  /**
   * @param {Object} options
   * @param {number} options.width - Room extent along X
   * @param {number} options.height - Room extent along Y
   * @param {number} options.depth - Room extent along Z
   * @param {THREE.Vector3} options.center - Room center in world space
   * @param {number} options.targetCellSize - Target world-space cell edge
   * @param {number} options.subdivisions - Minimum tree depth per surface
   * @param {THREE.Color|number} options.glowColor - Light color behind the panels
   * @param {THREE.Color|number} [options.colorMin] - Darkest cube gray
   * @param {THREE.Color|number} [options.colorMax] - Lightest cube gray
   * @param {number} [options.glowMin] - Weakest gap-spill intensity
   * @param {number} [options.glowMax] - Strongest gap-spill intensity
   * @param {number} [options.roundRadiusMin] - Smallest visible-face corner radius
   * @param {number} [options.roundRadiusMax] - Largest visible-face corner radius
   * @param {number} [options.roundRadius] - Fallback if min/max are omitted
   * @param {number} [options.faceBulge] - Front-face puff in world units
   * @param {number} [options.roundSegments] - XY subdivisions for the corner arc
   * @param {number} [options.roughnessMin]
   * @param {number} [options.roughnessMax]
   * @param {THREE.Color|number} [options.hemiSky]
   * @param {THREE.Color|number} [options.hemiGround]
   * @param {number} [options.hemiIntensity]
   */
  constructor(options = {}) {
    const p = { ...paramValues(params.CubeScene), ...options };
    const width = p.width ?? p.size ?? 18;
    const height = p.height ?? p.size ?? 18;
    const depth = p.depth ?? p.size ?? 18;
    const center = p.center ?? new THREE.Vector3();
    const targetCell = p.targetCellSize ?? 5;
    const minDepth = p.subdivisions ?? 6;
    const maxDepth = p.maxSubdivisions ?? 9;

    let nodeOffset = 0;
    let instanceOffset = 0;
    const surfaces = SURFACE_DIMS(width, height, depth).map(([u, v]) => {
      const layout = layoutSurface(u, v, targetCell, minDepth, maxDepth);
      const entry = { ...layout, nodeOffset, instanceOffset };
      nodeOffset += layout.nodes;
      instanceOffset += layout.leaves;
      return entry;
    });
    const maxTreeDepth = surfaces.reduce((d, s) => Math.max(d, s.treeDepth), 0);
    const totalNodes = nodeOffset;
    const count = instanceOffset;

    // Dense in XY so the visible-face corner arc has verts to bend; Z is
    // just the extrusion so it can stay coarse.
    const segsXY = p.roundSegments ?? 16;
    const segsZ = p.depthSegments ?? 5;
    const geometry = new THREE.BoxGeometry(1, 1, 1, segsXY, segsXY, segsZ);
    geometry.translate(0, 0, 0.5);

    const material = new THREE.MeshStandardNodeMaterial();
    material.name = "CubeWallMaterial";

    super(geometry, material, count);

    this._screenLight = options.screenLight ?? null;

    this._surfaces = surfaces;
    this._maxDepth = maxTreeDepth;
    this._totalNodes = totalNodes;
    this.count = count;
    this.frustumCulled = false;
    this.castShadow = false;
    this.receiveShadow = false;

    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i++) this.setMatrixAt(i, identity);
    this.instanceMatrix.needsUpdate = true;

    this.roomSize = new THREE.Vector3(width, height, depth);
    this.roomCenter = center.clone();

    // positionNode writes world-space verts; keep the cull volume around the
    // whole room so looking off-axis never drops the mesh. Vertical walls
    // sit keepOut behind the inner box.
    const keepOut =
      (p.depthMax ?? 1.4) + (p.faceBulge ?? 0) + (p.cornerInset ?? 0);
    const radius =
      0.5 * Math.hypot(width, height, depth) + keepOut + (p.depthMax ?? 1.4);
    this.boundingBox = new THREE.Box3().setFromCenterAndSize(
      this.roomCenter,
      this.roomSize.clone().addScalar(keepOut * 2),
    );
    this.boundingSphere = new THREE.Sphere(this.roomCenter.clone(), radius);
    this.geometry.boundingBox = this.boundingBox.clone();
    this.geometry.boundingSphere = this.boundingSphere.clone();
    this.computeBoundingBox = () => {
      this.boundingBox.setFromCenterAndSize(this.roomCenter, this.roomSize);
    };
    this.computeBoundingSphere = () => {
      this.boundingSphere.center.copy(this.roomCenter);
      this.boundingSphere.radius = radius;
    };

    this.uniforms = {
      time: uniform(0.0),
      roomSize: uniform(this.roomSize.clone()),
      roomCenter: uniform(this.roomCenter.clone()),
      gapMin: uniform(p.gapMin),
      gapMax: uniform(p.gapMax),
      depthMin: uniform(p.depthMin),
      depthMax: uniform(p.depthMax),
      glowColor: uniform(new THREE.Color(p.glowColor)),
      glowMin: uniform(p.glowMin),
      glowMax: uniform(p.glowMax),
      colorMin: uniform(new THREE.Color(p.colorMin)),
      colorMax: uniform(new THREE.Color(p.colorMax)),
      roundRadiusMin: uniform(p.roundRadiusMin ?? p.roundRadius),
      roundRadiusMax: uniform(p.roundRadiusMax ?? p.roundRadius),
      roughnessMin: uniform(p.roughnessMin ?? 0.45),
      roughnessMax: uniform(p.roughnessMax ?? 0.85),
      faceBulge: uniform(p.faceBulge),
      cornerInset: uniform(p.cornerInset ?? 0.2),
      hemiSky: uniform(new THREE.Color(p.hemiSky)),
      hemiGround: uniform(new THREE.Color(p.hemiGround)),
      hemiIntensity: uniform(p.hemiIntensity),
      rimStart: uniform(p.rimStart),
      rimStrength: uniform(p.rimStrength),
      sideGlowPower: uniform(p.sideGlowPower),
      backLightScale: uniform(p.backLightScale ?? 0.35),
      glowContrast: uniform(p.glowContrast),
      glowNoiseScale: uniform(p.glowNoiseScale),
      glowNoiseSpeed: uniform(p.glowNoiseSpeed),
      delta: uniform(1 / 60),
      hoveredId: uniform(-1),
      highlightLift: uniform(p.highlightLift ?? 1.2),
      highlightGlow: uniform(p.highlightGlow ?? 1.5),
      highlightGap: uniform(p.highlightGap ?? 0.6),
      highlightDecay: uniform(p.highlightDecay ?? 0.035),
      flowEnabled: uniform(options.flowTexture && p.flowEnabled !== false ? 1 : 0),
      flowLift: uniform(p.flowLift ?? 1.6),
      flowGlow: uniform(p.flowGlow ?? 0.8),
      flowHighlight: uniform(p.flowHighlight ?? 0.5),
    };
    this._flowTexture = texture(options.flowTexture ?? new THREE.Texture());

    this._createNodeParams();
    this._createInstanceMeta(count);
    this._createOutputBuffers(count);
    this._createCompute(count);
    this._setupMaterialNodes();
  }

  /**
   * Static per-node animation parameters: vec4(baseRatio, ±amp, speed, phase).
   * The split axis is decided once from the rest layout and packed into the
   * sign of amp (positive = split X, negative = split Y). Choosing the axis
   * from the animated aspect made it flip when a cell crossed square,
   * snapping the whole subtree - the axis must never change at runtime.
   */
  _createNodeParams() {
    const params = new Float32Array(this._totalNodes * 4);

    for (let i = 0; i < this._totalNodes; i++) {
      params[i * 4 + 0] = 0.46 + Math.random() * 0.08;
      params[i * 4 + 1] = 0.04 + Math.random() * 0.08;
      params[i * 4 + 2] = 0.05 + Math.random() * 0.16;
      params[i * 4 + 3] = Math.random() * Math.PI * 2;
    }

    // Rest-layout walk per surface: split the longer side at the base ratio,
    // record the axis, recurse. Runtime sway is small enough (clamped
    // 0.38..0.62) that this static choice keeps cells near square.
    for (const surf of this._surfaces) {
      const split = (node, w, h) => {
        if (node >= surf.nodes) return;
        const global = surf.nodeOffset + node;
        const axisX = w >= h;
        if (!axisX) params[global * 4 + 1] *= -1;
        const t = params[global * 4];
        if (axisX) {
          split(node * 2 + 1, w * t, h);
          split(node * 2 + 2, w * (1 - t), h);
        } else {
          split(node * 2 + 1, w, h * t);
          split(node * 2 + 2, w, h * (1 - t));
        }
      };
      split(0, surf.u, surf.v);
    }

    this.nodeBuffer = new StorageBufferAttribute(params, 4);
  }

  /**
   * Per-instance (surface, leaf, depth, nodeBase). Surfaces with more area
   * get a deeper tree, so extra cubes absorb the stretch instead of the cells.
   */
  _createInstanceMeta(count) {
    const meta = new Float32Array(count * 4);
    for (let s = 0; s < this._surfaces.length; s++) {
      const surf = this._surfaces[s];
      for (let leaf = 0; leaf < surf.leaves; leaf++) {
        const i = (surf.instanceOffset + leaf) * 4;
        meta[i + 0] = s;
        meta[i + 1] = leaf;
        meta[i + 2] = surf.treeDepth;
        meta[i + 3] = surf.nodeOffset;
      }
    }
    this.metaBuffer = new StorageBufferAttribute(meta, 4);
  }

  _createOutputBuffers(count) {
    // vec4: world base-center position xyz, w = gap light factor 0..1
    this.posGapBuffer = new StorageInstancedBufferAttribute(
      new Float32Array(count * 4),
      4,
    );
    // vec4: inner cell width, height, extrusion depth, leaf hash
    this.sizeBuffer = new StorageInstancedBufferAttribute(
      new Float32Array(count * 4),
      4,
    );
    // vec4: surface orientation quaternion
    const quats = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) quats[i * 4 + 3] = 1;
    this.quatBuffer = new StorageInstancedBufferAttribute(quats, 4);

    this.geometry.setAttribute("instancePosGap", this.posGapBuffer);
    this.geometry.setAttribute("instanceSize", this.sizeBuffer);
    this.geometry.setAttribute("instanceQuat", this.quatBuffer);

    // Read as storage (not a vertex attribute) in the material to stay under
    // WebGPU's 8 vertex buffer limit.
    this.highlightBuffer = new StorageBufferAttribute(new Float32Array(count), 1);
  }

  _createCompute(count) {
    const u = this.uniforms;
    const maxDepth = this._maxDepth;

    const nodeStorage = storage(this.nodeBuffer, "vec4", this._totalNodes);
    const metaStorage = storage(this.metaBuffer, "vec4", count);
    const posGapStorage = storage(this.posGapBuffer, "vec4", count);
    const sizeStorage = storage(this.sizeBuffer, "vec4", count);
    const quatStorage = storage(this.quatBuffer, "vec4", count);
    const highlightStorage = storage(this.highlightBuffer, "float", count);

    this.computeFn = Fn(() => {
      const idx = instanceIndex;
      const meta = metaStorage.element(idx).toVar();
      const surfF = meta.x;
      const leaf = uint(meta.y);
      const surfDepth = uint(meta.z);
      const nodeBase = uint(meta.w);

      // Per-surface plane extents
      // 0,1 back/front: X×Y   2,3 floor/ceil: X×Z   4,5 left/right: Z×Y
      const extU = select(
        surfF.lessThan(1.5),
        u.roomSize.x,
        select(surfF.lessThan(3.5), u.roomSize.x, u.roomSize.z),
      );
      const extV = select(
        surfF.lessThan(1.5),
        u.roomSize.y,
        select(surfF.lessThan(3.5), u.roomSize.z, u.roomSize.y),
      );
      const extN = select(
        surfF.lessThan(1.5),
        u.roomSize.z,
        select(surfF.lessThan(3.5), u.roomSize.y, u.roomSize.x),
      );

      // Walk the surface's binary tree; the leaf's bit pattern is its path.
      // Rect starts as the full surface in normalized 0..1 coords.
      const x0 = float(0.0).toVar();
      const y0 = float(0.0).toVar();
      const w = float(1.0).toVar();
      const h = float(1.0).toVar();
      const nodeIdx = uint(0).toVar();

      for (let level = 0; level < maxDepth; level++) {
        If(uint(level).lessThan(surfDepth), () => {
          const bit = leaf
            .shiftRight(surfDepth.sub(uint(level + 1)))
            .bitAnd(uint(1))
            .toVar();
          const bitF = float(bit);

          const nodeGlobal = nodeBase.add(nodeIdx).toVar();
          const p = nodeStorage.element(nodeGlobal).toVar();

          const t = clamp(
            p.x.add(abs(p.y).mul(sin(u.time.mul(p.z).add(p.w)))),
            0.38,
            0.62,
          ).toVar();

          // Static per-node axis packed in amp's sign (+ = X); never flips
          const splitX = select(
            p.y.greaterThanEqual(0.0),
            float(1.0),
            float(0.0),
          ).toVar();

          const oneMinusT = float(1.0).sub(t);
          const xNew = mix(x0, x0.add(w.mul(t).mul(bitF)), splitX).toVar();
          const wNew = mix(w, w.mul(mix(t, oneMinusT, bitF)), splitX).toVar();
          const invX = float(1.0).sub(splitX);
          const yNew = mix(y0, y0.add(h.mul(t).mul(bitF)), invX).toVar();
          const hNew = mix(h, h.mul(mix(t, oneMinusT, bitF)), invX).toVar();

          x0.assign(xNew);
          w.assign(wNew);
          y0.assign(yNew);
          h.assign(hNew);
          nodeIdx.assign(nodeIdx.mul(uint(2)).add(uint(1)).add(bit));
        });
      }

      // Vertical walls sit just behind the inner box so floor/ceil slabs
      // (which stay proud) cannot occupy the same volume. Back/front also
      // grow in X so the side-wall join is extra back-wall, not a hole.
      const keepOut = max(
        u.depthMax.add(u.faceBulge).add(u.cornerInset),
        float(0.0),
      );
      const isCap = surfF.lessThan(1.5);
      const isSide = surfF.greaterThan(3.5);
      const extUUse = select(isCap, extU.add(keepOut.mul(2)), extU);
      const offsetN = select(
        isCap,
        keepOut,
        select(isSide, keepOut, float(0.0)),
      );

      const su = x0.add(w.mul(0.5)).sub(0.5).mul(extUUse);
      const sv = y0.add(h.mul(0.5)).sub(0.5).mul(extV);
      const cw = w.mul(extUUse);
      const ch = h.mul(extV);

      const leafRand = hash(idx);

      // Breathing light gap: a slow wave travelling across the surface plus a
      // per-cell phase. Wider gap = more light (posGap.w drives the glow).
      const breathe = sin(
        u.time
          .mul(0.35)
          .add(su.mul(0.28))
          .add(sv.mul(0.2))
          .add(leafRand.mul(PI2)),
      )
        .mul(0.5)
        .add(0.5)
        .toVar();
      const gap = mix(u.gapMin, u.gapMax, breathe);

      // Inner cube keeps at least 70% of the cell so seams stay thin lines
      const innerW = max(cw.sub(gap), cw.mul(0.7));
      const innerH = max(ch.sub(gap), ch.mul(0.7));

      // Slow per-cell relief: extrusion depth drifts independently
      const depthWave = sin(
        u.time
          .mul(leafRand.mul(0.18).add(0.06))
          .add(leafRand.mul(PI2))
          .add(surfF),
      )
        .mul(0.5)
        .add(0.5);

      // Flow map is a 3x2 atlas of the surfaces, sampled at the cell center
      const atlasUv = vec2(
        mod(surfF, FLOW_ATLAS_COLS).add(x0.add(w.mul(0.5))).div(FLOW_ATLAS_COLS),
        floor(surfF.div(FLOW_ATLAS_COLS)).add(y0.add(h.mul(0.5))).div(FLOW_ATLAS_ROWS),
      );
      const flowAmount = this._flowTexture.sample(atlasUv).level(0).z
        .mul(u.flowEnabled).toVar();

      const hovered = select(float(idx).equal(u.hoveredId), float(1.0), float(0.0));
      const highlight = max(
        max(
          mix(highlightStorage.element(idx), float(0.0), dampFactorNode(u.highlightDecay, u.delta)),
          hovered,
        ),
        flowAmount.mul(u.flowHighlight),
      ).toVar();

      const depth = mix(u.depthMin, u.depthMax, depthWave)
        .add(highlight.mul(u.highlightLift))
        .add(flowAmount.mul(u.flowLift));
      const gapLight = breathe
        .add(highlight.mul(u.highlightGap))
        .add(flowAmount.mul(u.flowGlow));

      // Surface orientation: quaternion rotating local +z to the inward
      // normal. Surface center sits at roomCenter - normal * halfExtent.
      const qBack = vec4(0.0, 0.0, 0.0, 1.0);
      const qFront = vec4(0.0, 1.0, 0.0, 0.0);
      const qFloor = vec4(-HALF_SQRT, 0.0, 0.0, HALF_SQRT);
      const qCeil = vec4(HALF_SQRT, 0.0, 0.0, HALF_SQRT);
      const qLeft = vec4(0.0, HALF_SQRT, 0.0, HALF_SQRT);
      const qRight = vec4(0.0, -HALF_SQRT, 0.0, HALF_SQRT);

      const quat = select(
        surfF.lessThan(0.5),
        qBack,
        select(
          surfF.lessThan(1.5),
          qFront,
          select(
            surfF.lessThan(2.5),
            qFloor,
            select(
              surfF.lessThan(3.5),
              qCeil,
              select(surfF.lessThan(4.5), qLeft, qRight),
            ),
          ),
        ),
      ).toVar();

      const basePos = rotateByQuat(
        vec3(su, sv, extN.mul(-0.5).sub(offsetN)),
        quat,
      ).add(u.roomCenter);

      If(idx.lessThan(uint(count)), () => {
        posGapStorage.element(idx).assign(vec4(basePos, gapLight));
        sizeStorage.element(idx).assign(vec4(innerW, innerH, depth, leafRand));
        quatStorage.element(idx).assign(quat);
        highlightStorage.element(idx).assign(highlight);
      });
    });

    const workgroupSize = 64;
    const workgroupCount = Math.ceil(count / workgroupSize);
    this.computeNode = this.computeFn().compute(workgroupCount * workgroupSize);
  }

  /**
   * Round the visible face (local XY) as a 2D rounded rect, then puff only
   * that front cap. Radius is limited by face size, not extrusion depth, so
   * corners read on the face you're looking at instead of barreling the sides.
   */
  _roundedBox(localPos, size, radius, bulge) {
    const p = localPos.mul(size);
    const half = size.mul(0.5);
    const center = vec3(0, 0, half.z);
    const pc = p.sub(center);

    const r = min(radius, min(half.x, half.y).mul(0.49));
    const innerX = half.x.sub(r);
    const innerY = half.y.sub(r);
    const cx = clamp(pc.x, innerX.mul(-1), innerX);
    const cy = clamp(pc.y, innerY.mul(-1), innerY);
    const ox = pc.x.sub(cx);
    const oy = pc.y.sub(cy);
    const lo = max(length(vec2(ox, oy)), float(0.0001));
    const inCorner = step(float(0.0001), length(vec2(ox, oy))).mul(
      step(float(0.0001), r),
    );
    const rx = mix(pc.x, cx.add(ox.div(lo).mul(r)), inCorner);
    const ry = mix(pc.y, cy.add(oy.div(lo).mul(r)), inCorner);
    const rounded = vec3(rx, ry, pc.z);

    const frontMask = clamp(normalLocal.z, 0.0, 1.0);
    const anX = abs(rx).div(max(half.x, float(0.0001)));
    const anY = abs(ry).div(max(half.y, float(0.0001)));
    const puffZ = float(1)
      .sub(anX.mul(anX))
      .mul(float(1).sub(anY.mul(anY)))
      .mul(frontMask)
      .mul(bulge);
    const puffed = rounded.add(vec3(0, 0, puffZ));

    const nxy = vec3(ox.div(lo), oy.div(lo), 0);
    const onCap = step(float(0.7), abs(normalLocal.z));
    const nrm = mix(mix(normalLocal, nxy, inCorner), normalLocal, onCap);
    const nrmOut = normalize(
      mix(
        nrm,
        vec3(0, 0, 1),
        clamp(puffZ.mul(4.0), 0.0, 0.45),
      ),
    );

    return {
      position: puffed.add(center),
      normal: nrmOut,
    };
  }

  _setupMaterialNodes() {
    const u = this.uniforms;
    const material = this.material;

    const posGap = attribute("instancePosGap", "vec4");
    const sizeD = attribute("instanceSize", "vec4");
    const quat = attribute("instanceQuat", "vec4");

    const size = vec3(sizeD.x, sizeD.y, sizeD.z);
    const radius = mix(u.roundRadiusMin, u.roundRadiusMax, sizeD.w);
    const rounded = this._roundedBox(positionLocal, size, radius, u.faceBulge);

    const nWorld = rotateByQuat(rounded.normal, quat)
      .toVarying("v_cubeNormalWorld")
      .normalize();
    const inward = rotateByQuat(vec3(0, 0, 1), quat)
      .toVarying("v_cubeInward")
      .normalize();

    material.positionNode = rotateByQuat(rounded.position, quat).add(
      posGap.xyz,
    );

    material.normalNode = transformNormalToView(nWorld)
      .toVarying("v_cubeNormalView")
      .normalize();

    const gapLight = posGap.w.toVarying("v_cubeGapLight");
    const leafRand = sizeD.w.toVarying("v_cubeRand");

    // Raw unit-box coords as explicit varyings: positionLocal/normalLocal in
    // the fragment stage hold the post-positionNode (world-space) values, so
    // reading them here fed world coords into the masks and blew up per-cell
    const localPos = positionGeometry.toVarying("v_cubeLocalPos");
    const localNrm = normalGeometry.toVarying("v_cubeLocalNormal");

    const sideMask = float(1.0).sub(abs(localNrm.z));
    const frontMask = clamp(localNrm.z, 0.0, 1.0);
    // Local box coords: z 0..1 base→front, xy edges at ±0.5
    const localZ = clamp(localPos.z, 0.0, 1.0);
    const edge = clamp(
      max(abs(localPos.x), abs(localPos.y)).mul(2.0),
      0.0,
      1.0,
    );

    // Bake AO into albedo so crevices stay dark under the key light as well
    // as fill. Keep the front darkening as a thin rim: a soft face vignette
    // on the huge floor cells is exactly the banding we were seeing.
    const sideAO = mix(
      float(1.0),
      clamp(localZ.mul(0.85).add(0.15), 0.0, 1.0),
      sideMask,
    );
    const rimWidth = max(float(1.0).sub(u.rimStart), 0.001);
    const rim = pow(clamp(edge.sub(u.rimStart).div(rimWidth), 0.0, 1.0), 1.6);
    const frontAO = float(1.0).sub(rim.mul(u.rimStrength).mul(frontMask));
    const albedo = mix(u.colorMin, u.colorMax, leafRand);
    const albedoAO = albedo.mul(sideAO.mul(frontAO));
    const wrap = clamp(dot(nWorld, inward).mul(0.5).add(0.5), 0.0, 1.0);
    const irradiance = mix(u.hemiGround, u.hemiSky, wrap).mul(u.hemiIntensity);
    // Manual hemisphere GI lives in emissive so the look survives the
    // MeshStandard conversion (the scene deliberately has no lights)
    const lit = albedoAO.mul(irradiance);

    const sideGlow = sideMask.mul(
      pow(clamp(float(1.0).sub(localZ), 0.0, 1.0), u.sideGlowPower),
    );
    // Cap faces have exactly zero spill. Keep both procedural noise octaves
    // off that path; visible side faces still evaluate the original field.
    const glow = Fn(() => {
      const result = vec3(0).toVar();
      If(sideGlow.greaterThan(0), () => {
        const glowField = travelingGlowField(u.glowNoiseScale, u.glowNoiseSpeed, u.time);
        const glowAmt = mix(u.glowMin, u.glowMax,
          pow(clamp(glowField, 0.0, 1.0), u.glowContrast));
        result.assign(u.glowColor.mul(sideGlow.mul(gapLight).mul(glowAmt)));
      });
      return result;
    })();

    const highlight = storage(this.highlightBuffer, "float", this.count)
      .toReadOnly()
      .element(instanceIndex)
      .toVarying("v_cubeHighlight");
    const highlightGlow = u.glowColor.mul(
      highlight.mul(u.highlightGlow).mul(frontMask.mul(0.7).add(0.3)),
    );

    const roughness = mix(u.roughnessMin, u.roughnessMax, leafRand);
    material.colorNode = albedoAO;
    material.roughnessNode = roughness;
    material.metalness = 0;
    material.emissiveNode = lit.add(glow).add(highlightGlow);

    // Persistent-screen area light: needs the instanced world normal, the
    // TSL default normalWorld ignores the per-surface quaternion
    this._screenLight?.applyTo(material, {
      baseColor: albedoAO,
      roughness,
      normalNode: nWorld,
    });

    // Dimmer back-face emission fills the wall behind the screen, which the
    // front quad can't reach (LTC rejects points behind the emitting plane)
    this._screenLight?.applyTo(material, {
      baseColor: albedoAO,
      roughness,
      normalNode: nWorld,
      side: "back",
      intensityScale: u.backLightScale,
    });
  }

  /**
   * Cube instance under `ray`, found by replaying the compute pass's treemap
   * walk on the CPU at the same time value. InstancedMesh.raycast can't work
   * here (instance matrices are identity; real transforms exist only in GPU
   * buffers) and the animated treemap cells are not grid-aligned.
   *
   * @param {THREE.Ray} ray
   * @param {{ id: number, surface: number, u: number, v: number, point: THREE.Vector3 }} target
   * @returns {typeof target | null}
   */
  instanceAt(ray, target) {
    const u = this.uniforms;
    const size = this.roomSize;
    const center = this.roomCenter;
    const keepOut = Math.max(
      u.depthMax.value + u.faceBulge.value + u.cornerInset.value,
      0,
    );
    // Visible faces sit roughly one mid extrusion in front of the base plane
    const inset = (u.depthMin.value + u.depthMax.value + u.faceBulge.value) * 0.5;
    const hx = Math.max(size.x * 0.5 + keepOut - inset, 0.01);
    const hy = Math.max(size.y * 0.5 - inset, 0.01);
    const hz = Math.max(size.z * 0.5 + keepOut - inset, 0.01);
    _box.min.set(center.x - hx, center.y - hy, center.z - hz);
    _box.max.set(center.x + hx, center.y + hy, center.z + hz);
    if (!ray.intersectBox(_box, _hit)) return null;

    const ax = Math.abs(_hit.x - center.x) / hx;
    const ay = Math.abs(_hit.y - center.y) / hy;
    const az = Math.abs(_hit.z - center.z) / hz;
    let surf;
    if (az >= ax && az >= ay) surf = _hit.z < center.z ? 0 : 1;
    else if (ay >= ax) surf = _hit.y < center.y ? 2 : 3;
    else surf = _hit.x < center.x ? 4 : 5;

    _local.subVectors(_hit, center).applyQuaternion(SURFACE_INVERSE[surf]);
    const extU = surf < 4 ? size.x : size.z;
    const extV = surf < 2 ? size.y : surf < 4 ? size.z : size.y;
    const extUUse = surf < 2 ? extU + keepOut * 2 : extU;
    const nu = Math.min(Math.max(_local.x / extUUse + 0.5, 0), 0.999999);
    const nv = Math.min(Math.max(_local.y / extV + 0.5, 0), 0.999999);

    const surface = this._surfaces[surf];
    const nodes = this.nodeBuffer.array;
    const time = u.time.value;
    let x0 = 0, y0 = 0, w = 1, h = 1, node = 0, leaf = 0;
    for (let level = 0; level < surface.treeDepth; level++) {
      const i = (surface.nodeOffset + node) * 4;
      const t = Math.min(0.62, Math.max(0.38,
        nodes[i] + Math.abs(nodes[i + 1]) * Math.sin(time * nodes[i + 2] + nodes[i + 3])));
      let bit;
      if (nodes[i + 1] >= 0) {
        bit = nu >= x0 + w * t ? 1 : 0;
        if (bit) x0 += w * t;
        w *= bit ? 1 - t : t;
      } else {
        bit = nv >= y0 + h * t ? 1 : 0;
        if (bit) y0 += h * t;
        h *= bit ? 1 - t : t;
      }
      leaf = leaf * 2 + bit;
      node = node * 2 + 1 + bit;
    }

    target.id = surface.instanceOffset + leaf;
    target.surface = surf;
    target.u = nu;
    target.v = nv;
    target.point.copy(_hit);
    return target;
  }

  /** @param {number} id - Instance id, or -1 for none */
  setHovered(id) {
    this.uniforms.hoveredId.value = id;
  }

  setFlowTexture(flowTexture) {
    this._flowTexture.value = flowTexture;
  }

  /**
   * @param {number} time - Seconds
   * @param {number} [delta] - Seconds
   */
  update(time, delta = 1 / 60) {
    this.uniforms.time.value = time;
    this.uniforms.delta.value = Math.min(Math.max(delta, 0), 1 / 20);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
