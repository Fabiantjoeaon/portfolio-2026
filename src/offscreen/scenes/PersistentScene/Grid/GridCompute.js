import { StorageInstancedBufferAttribute, Vector2 } from "three/webgpu";
import {
  Fn,
  If,
  instanceIndex,
  storage,
  uniform,
  float,
  uint,
  vec2,
  vec3,
  vec4,
  sin,
  cos,
  acos,
  floor,
  mod,
  length,
  distance,
  clamp,
  mix,
  normalize,
  cross,
  dot,
  select,
  abs,
  pow,
  hash,
  PI,
  PI2,
} from "three/tsl";

// ---------------------------------------------------------------------------
// TSL quaternion helpers (ported from the portfolio-2022 GLSL shader chunks)
// ---------------------------------------------------------------------------

const QUAT_IDENTITY = vec4(0.0, 0.0, 0.0, 1.0);

const quatFromAxisAngle = (axis, angle) => {
  const halfAngle = angle.mul(0.5);
  return vec4(axis.mul(sin(halfAngle)), cos(halfAngle));
};

const lookAtQuat = (source, dest, angleMultiplier) => {
  const front = vec3(0.0, 0.0, 1.0);
  const to = normalize(dest.sub(source));
  const axisRaw = cross(front, to);
  const axis = select(
    length(axisRaw).lessThan(1e-5),
    vec3(0.0, 1.0, 0.0),
    normalize(axisRaw)
  );
  const ang = acos(clamp(dot(front, to), -1.0, 1.0));
  return quatFromAxisAngle(axis, ang.mul(angleMultiplier));
};

const qmul = (q1, q2) =>
  vec4(
    q2.xyz.mul(q1.w).add(q1.xyz.mul(q2.w)).add(cross(q1.xyz, q2.xyz)),
    q1.w.mul(q2.w).sub(dot(q1.xyz, q2.xyz))
  );

const slerpQuat = (a, b, t) => {
  const cosHalf = dot(a, b);
  const bAdj = select(cosHalf.lessThan(0.0), b.negate(), b);
  const c = clamp(abs(cosHalf), 0.0, 0.9995);
  const halfAngle = acos(c);
  const sinHalf = sin(halfAngle);
  const useLerp = c.greaterThan(0.99);
  const oneMinusT = float(1.0).sub(t);
  const blendA = select(
    useLerp,
    oneMinusT,
    sin(halfAngle.mul(oneMinusT)).div(sinHalf)
  );
  const blendB = select(useLerp, t, sin(halfAngle.mul(t)).div(sinHalf));
  return normalize(a.mul(blendA).add(bAdj.mul(blendB)));
};

export const rotateByQuat = (v, q) =>
  v.add(cross(q.xyz, cross(q.xyz, v).add(v.mul(q.w))).mul(2.0));

/**
 * GridCompute - GPGPU mouse-follow simulation for grid tiles.
 *
 * Port of the portfolio-2022 GPUComputationRenderer "influence" pass to
 * WebGPU TSL compute with persistent storage buffers. Per tile it damps an
 * influence value (cosine falloff around the mouse) and a distance-to-hovered
 * value, then derives offset, quaternion rotation, and scale from them.
 *
 * Unlike the old grid, mouse and tile positions are compared directly in
 * grid-local world space (no UV remapping), which fixes the old offset bugs.
 */
export class GridCompute {
  /**
   * @param {number} count - Number of tile instances
   * @param {number} cols - Number of columns in grid
   * @param {number} rows - Number of rows in grid
   * @param {Object} layout - { cellSize, originX, originY, mouseRadius }
   * @param {Float32Array} activeFlags - Per-instance 0/1 interactive-tile flags
   */
  constructor(count, cols, rows, layout = {}, activeFlags = null) {
    this.uniforms = {
      time: uniform(0.0),
      delta: uniform(1 / 60),
      cols: uniform(cols),
      rows: uniform(rows),
      cellSize: uniform(layout.cellSize ?? 1.0),
      originX: uniform(layout.originX ?? 0.0),
      originY: uniform(layout.originY ?? 0.0),
      // Damped mouse position in grid-local space (lerped on CPU like the old grid)
      mousePos: uniform(new Vector2(0, 0)),
      // Mouse unprojected onto the plane at hoverLift height, so a popped-out
      // tile lands exactly under the cursor despite perspective
      mouseLifted: uniform(new Vector2(0, 0)),
      hoveredTile: uniform(new Vector2(-1, -1)),
      hasHover: uniform(0.0),
      mouseRadius: uniform(layout.mouseRadius ?? 2.0),
      // How far tiles push away from the mouse (old grid: 0.2)
      pushStrength: uniform(layout.pushStrength ?? 0.2),
      // Z push-back under influence and z pop height when hovered
      pushZ: uniform(layout.pushZ ?? 2.0),
      hoverLift: uniform(layout.hoverLift ?? 2.0),
      idleAmplitude: uniform(0.5),
      // Same lerp alphas as the old influence shader (per 60fps frame)
      influenceLerp: uniform(0.05),
      hoverLerp: uniform(0.07),
    };

    this.rebuild(count, cols, rows, layout, activeFlags);
  }

  /**
   * (Re)build buffers and compute shader for a new instance count / layout
   */
  rebuild(count, cols, rows, layout = {}, activeFlags = null) {
    this.count = count;
    this.cols = cols;
    this.rows = rows;

    this.uniforms.cols.value = cols;
    this.uniforms.rows.value = rows;
    this.setLayout(layout);

    this._createBuffers(count, activeFlags);
    this._createComputeShader();
  }

  setLayout(layout = {}) {
    if (layout.cellSize !== undefined)
      this.uniforms.cellSize.value = layout.cellSize;
    if (layout.originX !== undefined)
      this.uniforms.originX.value = layout.originX;
    if (layout.originY !== undefined)
      this.uniforms.originY.value = layout.originY;
    if (layout.mouseRadius !== undefined)
      this.uniforms.mouseRadius.value = layout.mouseRadius;
    if (layout.pushStrength !== undefined)
      this.uniforms.pushStrength.value = layout.pushStrength;
    if (layout.pushZ !== undefined) this.uniforms.pushZ.value = layout.pushZ;
    if (layout.hoverLift !== undefined)
      this.uniforms.hoverLift.value = layout.hoverLift;
  }

  _createBuffers(count, activeFlags = null) {
    // Buffers are packed to stay under WebGPU's 8 vertex buffer limit:
    // offset.xyz + scale in one vec4, influence/distToHovered/active in another

    const offsets = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) offsets[i * 4 + 3] = 1; // scale
    this.offsetBuffer = new StorageInstancedBufferAttribute(offsets, 4);

    // Quaternion per instance, initialized to identity
    const rotations = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) rotations[i * 4 + 3] = 1;
    this.rotationBuffer = new StorageInstancedBufferAttribute(rotations, 4);

    // x = influence, y = distanceToHovered (damped state),
    // z = interactive ("project") tile flag, written on CPU per rebuild
    const influence = new Float32Array(count * 4);
    if (activeFlags) {
      for (let i = 0; i < count; i++) influence[i * 4 + 2] = activeFlags[i];
    }
    this.influenceBuffer = new StorageInstancedBufferAttribute(influence, 4);
  }

  _createComputeShader() {
    const u = this.uniforms;

    const offsetStorage = storage(this.offsetBuffer, "vec4", this.count);
    const rotationStorage = storage(this.rotationBuffer, "vec4", this.count);
    const influenceStorage = storage(this.influenceBuffer, "vec4", this.count);

    this.computeFn = Fn(() => {
      const idx = instanceIndex;
      const fi = float(idx);
      const col = mod(fi, u.cols);
      const row = floor(fi.div(u.cols));

      // Tile center in grid-local space (matches Grid._updatePositions)
      const tilePos = vec2(
        col.mul(u.cellSize).add(u.originX),
        row.mul(u.cellSize).add(u.originY)
      );

      const mouse = u.mousePos;

      // Influence target: cosine falloff around the mouse, 0..2 (old grid range)
      const radial = length(tilePos.sub(mouse).div(u.mouseRadius)).mul(PI);
      const influenceTarget = cos(clamp(radial, 0.0, PI))
        .add(1.0)
        .mul(u.hasHover);

      // Distance-to-hovered: 1 on the hovered tile, fading out within one cell
      const gridCoord = vec2(col, row);
      const hoverTarget = float(1.0)
        .sub(clamp(distance(u.hoveredTile, gridCoord), 0.0, 1.0))
        .mul(u.hasHover);

      // Damped state, frame-rate independent (matches old alphas at 60fps)
      const frames = u.delta.mul(60.0);
      const kInfluence = float(1.0).sub(
        pow(float(1.0).sub(u.influenceLerp), frames)
      );
      const kHover = float(1.0).sub(pow(float(1.0).sub(u.hoverLerp), frames));

      const prev = influenceStorage.element(idx).toVar();
      const influence = mix(prev.x, influenceTarget, kInfluence).toVar();
      const distToHovered = mix(prev.y, hoverTarget, kHover).toVar();
      const active = prev.z.toVar(); // CPU-written interactive-tile flag

      // Offset: push away from the mouse; the hovered tile is pulled fully to
      // the lifted mouse position so it sits exactly under the cursor
      const push = tilePos.sub(mouse).mul(influence).mul(u.pushStrength);
      const pull = u.mouseLifted.sub(tilePos);
      const offsetXY = mix(push, pull, distToHovered);
      const hoverZ = mix(
        u.pushZ.negate().mul(influence),
        u.hoverLift,
        distToHovered
      );

      // Idle per-tile z drift (old vRandOffset); active tiles stay put
      const rand = hash(idx);
      const idleZ = sin(u.time.mul(rand).mul(1.8))
        .mul(rand)
        .mul(u.idleAmplitude)
        .mul(float(1.0).sub(active));

      // Scale: slight shrink under influence, pop out when hovered
      const scale = float(1.0)
        .sub(influence.mul(0.05))
        .add(distToHovered.mul(0.8));

      // Rotation: look-at toward mouse slerped by influence, spun when hovered
      const lookTo = vec3(mouse, influence);
      const toRot = lookAtQuat(vec3(tilePos, 0.0), lookTo, float(2.0));

      const hoverAxis = normalize(vec3(-2.0, -2.0, 0.0));
      const hoveredRot = normalize(
        quatFromAxisAngle(hoverAxis, PI2.mul(distToHovered))
      );

      const rotMultiplied = slerpQuat(QUAT_IDENTITY, toRot, influence);
      const cubic = distToHovered.mul(distToHovered).mul(distToHovered);
      const finalRot = normalize(
        mix(qmul(rotMultiplied, hoveredRot), hoveredRot, cubic)
      );

      // Only in-range threads may write: padded workgroup threads' clamped
      // out-of-bounds writes would corrupt the last tile
      If(idx.lessThan(uint(this.count)), () => {
        influenceStorage
          .element(idx)
          .assign(vec4(influence, distToHovered, active, 0.0));
        offsetStorage
          .element(idx)
          .assign(vec4(offsetXY, hoverZ.add(idleZ), scale));
        rotationStorage.element(idx).assign(finalRot);
      });
    });

    const workgroupSize = 64;
    const workgroupCount = Math.ceil(this.count / workgroupSize);
    this.computeNode = this.computeFn().compute(workgroupCount * workgroupSize);
  }

  /**
   * @param {number} time - Current time in seconds
   * @param {number} delta - Time delta in seconds
   */
  update(time, delta) {
    this.uniforms.time.value = time;
    this.uniforms.delta.value = Math.min(delta || 1 / 60, 1 / 30);
  }

  getComputeNode() {
    return this.computeNode;
  }

  /**
   * Storage buffers for binding to geometry as instanced attributes
   */
  getBuffers() {
    return {
      instanceOffset: this.offsetBuffer, // vec4: xyz offset, w scale
      instanceRotation: this.rotationBuffer, // vec4 quaternion
      instanceInfluence: this.influenceBuffer, // x influence, y distToHovered, z active
    };
  }
}
