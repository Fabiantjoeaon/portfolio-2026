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
  sin,
  clamp,
  mix,
  max,
  select,
  abs,
  pow,
  hash,
  PI2,
} from "three/tsl";
import { rotateByQuat } from "../PersistentScene/Grid/GridCompute.js";

const HALF_SQRT = 0.7071067811865476;

const SURFACE_DIMS = (width, height, depth) => [
  [width, height],
  [width, height],
  [width, depth],
  [width, depth],
  [depth, height],
  [depth, height],
];

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
   */
  constructor(options = {}) {
    const width = options.width ?? options.size ?? 18;
    const height = options.height ?? options.size ?? 18;
    const depth = options.depth ?? options.size ?? 18;
    const center = options.center ?? new THREE.Vector3();
    const targetCell = options.targetCellSize ?? 5;
    const minDepth = options.subdivisions ?? 6;
    const maxDepth = options.maxSubdivisions ?? 9;

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

    // Unit cube with its base on the surface plane (z in 0..1)
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0, 0.5);

    // Lambert: per-face diffuse only. Standard+roughness 1 still carries a
    // wide specular lobe, which turned the floor into a banded highlight.
    const material = new THREE.MeshLambertNodeMaterial();
    material.name = "CubeWallMaterial";

    super(geometry, material, count);

    this._surfaces = surfaces;
    this._maxDepth = maxTreeDepth;
    this._totalNodes = totalNodes;
    this.count = count;
    this.frustumCulled = false;

    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i++) this.setMatrixAt(i, identity);
    this.instanceMatrix.needsUpdate = true;

    this.roomSize = new THREE.Vector3(width, height, depth);
    this.roomCenter = center.clone();

    // positionNode writes world-space verts; keep the cull volume around the
    // whole room so looking off-axis never drops the mesh
    const radius =
      0.5 * Math.hypot(width, height, depth) + (options.depthMax ?? 1.4);
    this.boundingBox = new THREE.Box3().setFromCenterAndSize(
      this.roomCenter,
      this.roomSize,
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
      gapMin: uniform(options.gapMin ?? 0.03),
      gapMax: uniform(options.gapMax ?? 0.22),
      depthMin: uniform(options.depthMin ?? 0.25),
      depthMax: uniform(options.depthMax ?? 1.4),
      glowColor: uniform(new THREE.Color(options.glowColor ?? 0xdfe8f5)),
      glowIntensity: uniform(options.glowIntensity ?? 2.7),
      baseColor: uniform(new THREE.Color(options.color ?? 0x171717)),
      // baseColor: uniform(new THREE.Color(options.color ?? 0x000000)),
    };

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
  }

  _createCompute(count) {
    const u = this.uniforms;
    const maxDepth = this._maxDepth;

    const nodeStorage = storage(this.nodeBuffer, "vec4", this._totalNodes);
    const metaStorage = storage(this.metaBuffer, "vec4", count);
    const posGapStorage = storage(this.posGapBuffer, "vec4", count);
    const sizeStorage = storage(this.sizeBuffer, "vec4", count);
    const quatStorage = storage(this.quatBuffer, "vec4", count);

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

      const su = x0.add(w.mul(0.5)).sub(0.5).mul(extU);
      const sv = y0.add(h.mul(0.5)).sub(0.5).mul(extV);
      const cw = w.mul(extU);
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
      const depth = mix(u.depthMin, u.depthMax, depthWave);

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

      const basePos = rotateByQuat(vec3(su, sv, extN.mul(-0.5)), quat).add(
        u.roomCenter,
      );

      If(idx.lessThan(uint(count)), () => {
        posGapStorage.element(idx).assign(vec4(basePos, breathe));
        sizeStorage.element(idx).assign(vec4(innerW, innerH, depth, leafRand));
        quatStorage.element(idx).assign(quat);
      });
    });

    const workgroupSize = 64;
    const workgroupCount = Math.ceil(count / workgroupSize);
    this.computeNode = this.computeFn().compute(workgroupCount * workgroupSize);
  }

  _setupMaterialNodes() {
    const u = this.uniforms;
    const material = this.material;

    const posGap = attribute("instancePosGap", "vec4");
    const sizeD = attribute("instanceSize", "vec4");
    const quat = attribute("instanceQuat", "vec4");

    const scaled = positionLocal.mul(vec3(sizeD.x, sizeD.y, sizeD.z));
    material.positionNode = rotateByQuat(scaled, quat).add(posGap.xyz);

    // Rotated normal computed in the vertex stage and passed as an explicit
    // varying (same pattern as GridTile); evaluating the attribute-based
    // rotation per fragment produced garbage normals on some instances
    material.normalNode = transformNormalToView(rotateByQuat(normalLocal, quat))
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
    const rim = pow(clamp(edge.sub(0.78).div(0.22), 0.0, 1.0), 1.6);
    const frontAO = float(1.0).sub(rim.mul(0.4).mul(frontMask));
    const albedo = u.baseColor.mul(leafRand.mul(0.22).add(0.86));
    material.colorNode = albedo.mul(sideAO.mul(frontAO));

    // Gap light onto the cubes: grazing spill up the sides (bright at the
    // base, fading toward the front) plus a tight bleed onto the front face
    // borders so the glow wraps without washing the matte face
    const sideGlow = sideMask.mul(
      pow(clamp(float(1.0).sub(localZ), 0.0, 1.0), 2.4),
    );
    const frontBleed = frontMask.mul(pow(edge, 14.0)).mul(0.18);
    material.emissiveNode = u.glowColor.mul(
      sideGlow.add(frontBleed).mul(gapLight).mul(u.glowIntensity),
    );
  }

  /**
   * @param {number} time - Seconds
   */
  update(time) {
    this.uniforms.time.value = time;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
