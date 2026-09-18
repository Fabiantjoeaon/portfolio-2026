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
  normalLocal,
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

/**
 * CubeWalls - all six surfaces of the room as one instanced mesh.
 *
 * Each surface is a recursive binary subdivision (treemap) of fixed depth.
 * The split ratio of every tree node oscillates slowly (base + amp *
 * sin(time * speed + phase), parameters in a storage buffer), so when a cell
 * grows its neighbours shrink and the layout always tiles the full surface.
 *
 * A single GPGPU compute pass walks the tree per instance (the leaf's path is
 * the bit pattern of its index) and outputs world position, inner cell size
 * (cell minus the breathing light gap), extrusion depth, and a gap-light
 * factor. Nothing is uploaded per frame - the CPU only ticks a time uniform.
 */
export class CubeWalls extends THREE.InstancedMesh {
  /**
   * @param {Object} options
   * @param {number} options.size - Room edge length in world units
   * @param {number} options.depth - Subdivision depth (leaves per surface = 2^depth)
   * @param {THREE.Color|number} options.glowColor - Light color behind the panels
   */
  constructor(options = {}) {
    const size = options.size ?? 18;
    const treeDepth = options.depth ?? 6;
    const leavesPerSurface = 1 << treeDepth;
    const nodesPerSurface = leavesPerSurface - 1;
    const count = 6 * leavesPerSurface;

    // Unit cube with its base on the surface plane (z in 0..1)
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0, 0.5);

    const material = new THREE.MeshStandardNodeMaterial();
    material.name = "CubeWallMaterial";
    material.color = new THREE.Color(options.color ?? 0x2c2c30);
    material.roughness = 0.9;
    material.metalness = 0.0;

    super(geometry, material, count);

    this.count = count;
    this.frustumCulled = false;

    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i++) this.setMatrixAt(i, identity);
    this.instanceMatrix.needsUpdate = true;

    this._treeDepth = treeDepth;
    this._leavesPerSurface = leavesPerSurface;
    this._nodesPerSurface = nodesPerSurface;

    this.uniforms = {
      time: uniform(0.0),
      size: uniform(size),
      gapMin: uniform(options.gapMin ?? 0.03),
      gapMax: uniform(options.gapMax ?? 0.22),
      depthMin: uniform(options.depthMin ?? 0.25),
      depthMax: uniform(options.depthMax ?? 1.4),
      glowColor: uniform(new THREE.Color(options.glowColor ?? 0xdfe8f5)),
      glowIntensity: uniform(options.glowIntensity ?? 0.7),
    };

    this._createNodeParams();
    this._createOutputBuffers(count);
    this._createCompute(count);
    this._setupMaterialNodes();
  }

  /**
   * Static per-node animation parameters: vec4(baseRatio, amp, speed, phase).
   * Written once; the compute shader derives the animated ratio from time.
   */
  _createNodeParams() {
    const totalNodes = 6 * this._nodesPerSurface;
    const params = new Float32Array(totalNodes * 4);

    for (let i = 0; i < totalNodes; i++) {
      params[i * 4 + 0] = 0.38 + Math.random() * 0.24; // base ratio
      params[i * 4 + 1] = 0.06 + Math.random() * 0.13; // sway amplitude
      params[i * 4 + 2] = 0.05 + Math.random() * 0.16; // speed (rad/s), slow
      params[i * 4 + 3] = Math.random() * Math.PI * 2; // phase
    }

    this.nodeBuffer = new StorageBufferAttribute(params, 4);
  }

  _createOutputBuffers(count) {
    // vec4: world base-center position xyz, w = gap light factor 0..1
    this.posGapBuffer = new StorageInstancedBufferAttribute(
      new Float32Array(count * 4),
      4
    );
    // vec4: inner cell width, height, extrusion depth, leaf hash
    this.sizeBuffer = new StorageInstancedBufferAttribute(
      new Float32Array(count * 4),
      4
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
    const D = this._treeDepth;
    const leaves = this._leavesPerSurface;
    const nodesPer = this._nodesPerSurface;

    const nodeStorage = storage(this.nodeBuffer, "vec4", 6 * nodesPer);
    const posGapStorage = storage(this.posGapBuffer, "vec4", count);
    const sizeStorage = storage(this.sizeBuffer, "vec4", count);
    const quatStorage = storage(this.quatBuffer, "vec4", count);

    this.computeFn = Fn(() => {
      const idx = instanceIndex;
      const surf = idx.div(uint(leaves)).toVar();
      const leaf = idx.sub(surf.mul(uint(leaves))).toVar();
      const surfF = float(surf);
      const nodeBase = surf.mul(uint(nodesPer));

      // Walk the surface's binary tree; the leaf's bit pattern is its path.
      // Rect starts as the full surface in normalized 0..1 coords.
      const x0 = float(0.0).toVar();
      const y0 = float(0.0).toVar();
      const w = float(1.0).toVar();
      const h = float(1.0).toVar();
      const nodeIdx = uint(0).toVar();

      for (let level = 0; level < D; level++) {
        const bit = leaf
          .shiftRight(uint(D - 1 - level))
          .bitAnd(uint(1))
          .toVar();
        const bitF = float(bit);

        const nodeGlobal = nodeBase.add(nodeIdx).toVar();
        const p = nodeStorage.element(nodeGlobal).toVar();

        // Animated split ratio - always mid-range so no cell collapses
        const t = clamp(
          p.x.add(p.y.mul(sin(u.time.mul(p.z).add(p.w)))),
          0.15,
          0.85
        ).toVar();

        // Split axis alternates per level, occasionally flipped per node so
        // the layout reads as an organic treemap instead of a regular grid
        const levelAxis = level % 2 === 0 ? 1.0 : 0.0;
        const flip = hash(nodeGlobal.add(uint(7919)));
        const splitX = select(
          flip.greaterThan(0.72),
          float(1.0 - levelAxis),
          float(levelAxis)
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
      }

      // Cell center and size in surface-local world units
      const su = x0.add(w.mul(0.5)).sub(0.5).mul(u.size);
      const sv = y0.add(h.mul(0.5)).sub(0.5).mul(u.size);
      const cw = w.mul(u.size);
      const ch = h.mul(u.size);

      const leafRand = hash(idx);

      // Breathing light gap: a slow wave travelling across the surface plus a
      // per-cell phase. Wider gap = more light (posGap.w drives the glow).
      const breathe = sin(
        u.time
          .mul(0.35)
          .add(su.mul(0.28))
          .add(sv.mul(0.2))
          .add(leafRand.mul(PI2))
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
        u.time.mul(leafRand.mul(0.18).add(0.06)).add(leafRand.mul(PI2)).add(surfF)
      )
        .mul(0.5)
        .add(0.5);
      const depth = mix(u.depthMin, u.depthMax, depthWave);

      // Surface orientation: quaternion rotating local +z to the inward
      // normal. Surface center sits at -normal * size/2.
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
              select(surfF.lessThan(4.5), qLeft, qRight)
            )
          )
        )
      ).toVar();

      const basePos = rotateByQuat(
        vec3(su, sv, u.size.mul(-0.5)),
        quat
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

    material.normalNode = transformNormalToView(
      rotateByQuat(normalLocal, quat)
    ).normalize();

    // Glow spill: light from behind the panels grazes the cube sides, bright
    // at the base and decaying toward the front. Front faces stay dark matte.
    const gapLight = posGap.w.toVarying("v_cubeGapLight");
    const sideMask = float(1.0).sub(abs(normalLocal.z));
    const baseFalloff = pow(
      clamp(float(1.0).sub(positionLocal.z), 0.0, 1.0),
      3.0
    );
    material.emissiveNode = u.glowColor.mul(
      sideMask.mul(baseFalloff).mul(gapLight).mul(u.glowIntensity)
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
