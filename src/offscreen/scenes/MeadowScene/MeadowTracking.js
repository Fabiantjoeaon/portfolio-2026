import { Box3, DataUtils, HalfFloatType, Vector3 } from "three/webgpu";
import { TrackingOverlay } from "../../effects/TrackingOverlay.js";
import { trackingRandom, trackingSmooth } from "../../effects/trackingMath.js";

const WALL_TARGETS = 8;
const CAPACITY = 24;
const FRAMES = 170;

/** Meadow adapter only: shared renderer has no knowledge of roses or plants. */
export class MeadowTracking {
  constructor({ trail, wall, screenLight, vatTexture, remapInfo }) {
    this.trail = trail;
    this.wall = wall;
    this.screenLight = screenLight;
    this.overlay = new TrackingOverlay({ capacity: CAPACITY });
    this.ready = this.overlay.ready;
    this.targets = Array.from({ length: CAPACITY }, () => ({ position: new Vector3(), opacity: 0, size: 28 }));
    this.wallBounds = new Box3();
    this.solids = [this.wallBounds];
    this.corners = screenLight ? [screenLight.corners.p0.value, screenLight.corners.p1.value,
      screenLight.corners.p2.value, screenLight.corners.p3.value] : [];
    this._screenCornerCount = this.corners.length;
    this._gridCorners = Array.from({ length: 8 }, () => new Vector3());
    this._stemFrames = new Float32Array(FRAMES * 3);
    this._roseOrder = [];
    this._birthVersion = -1;
    this._newestFirst = (a, b) => trail.attributes.birth.getX(b) - trail.attributes.birth.getX(a);
    if (trail) this._cacheStem(vatTexture, remapInfo["os-remap"]);
  }

  _cacheStem(vat, remap) {
    const { uv, uv1, position } = this.trail.roses.geometry.attributes;
    const { data, width, height } = vat.image;
    const decode = vat.type === HalfFloatType ? DataUtils.fromHalfFloat : value => value;
    const sample = (vertex, frame, channel) => {
      const x = Math.min(width - 1, Math.floor(uv1.getX(vertex) * width));
      const y = Math.floor((0.9985294 - frame / height) * height);
      return decode(data[(y * width + x) * 4 + channel]) * (remap.Max[channel] - remap.Min[channel]) + remap.Min[channel];
    };
    // A real stem vertex at mid-height. Cache its tiny animation once instead
    // of scanning geometry or sampling the entire VAT on the animation thread.
    let vertex = 0, closest = Infinity;
    for (let i = 0; i < uv.count; i++) {
      if (uv.getY(i) < 0.69 || uv.getY(i) > 0.72) continue;
      const distance = Math.abs(sample(i, 80, 2) - 0.65);
      if (distance < closest) { closest = distance; vertex = i; }
    }
    for (let frame = 0; frame < FRAMES; frame++) {
      this._stemFrames[frame * 3] = position.getX(vertex) + sample(vertex, frame, 0);
      this._stemFrames[frame * 3 + 1] = position.getY(vertex) + sample(vertex, frame, 2);
      this._stemFrames[frame * 3 + 2] = position.getZ(vertex) - sample(vertex, frame, 1);
    }
  }

  configure() {
    this.wall.updateWorldMatrix(true, true);
    this.wallBounds.setFromObject(this.wall);
  }

  update(camera, viewport, time, grid) {
    if (grid) this._grid = grid;
    if (this._grid) {
      // Protect the whole tile wall too, not just the inset video plane.
      const grid = this._grid;
      const { width, height } = grid.getDimensions();
      const depth = (grid.compute?.uniforms.hoverLift.value ?? 0) + grid.tileUniforms.boxHalf.value.z + 1;
      grid.updateWorldMatrix(true, false);
      for (let i = 0; i < 8; i++) {
        this._gridCorners[i].set((i & 1 ? 1 : -1) * (width * 0.5 + 0.5),
          (i & 2 ? 1 : -1) * (height * 0.5 + 0.5), i & 4 ? depth : -depth)
          .applyMatrix4(grid.matrixWorld);
        this.corners[this._screenCornerCount + i] = this._gridCorners[i];
      }
    }
    const bounds = this.wallBounds;
    for (let i = 0; i < WALL_TARGETS; i++) {
      const target = this.targets[i];
      const cycle = time / 7 + i * 0.37;
      const epoch = Math.floor(cycle), phase = cycle - epoch;
      const seed = i * 17 + epoch * 53;
      // Reacquire slowly, only while faded out; no frame-to-frame randomness.
      const x = 0.2 + trackingRandom(seed + 1) * 0.6;
      const y = 0.18 + trackingRandom(seed + 2) * 0.42;
      target.position.set(
        bounds.min.x + (bounds.max.x - bounds.min.x) * x,
        bounds.min.y + (bounds.max.y - bounds.min.y) * y,
        bounds.max.z + 0.65,
      );
      target.size = 23 + trackingRandom(seed + 3) * 25;
      target.opacity = trackingSmooth(0, 0.12, phase) * (1 - trackingSmooth(0.75, 1, phase)) * 0.8;
    }
    let count = WALL_TARGETS;
    if (this.trail) {
      const { controls: c, attributes: a, roses } = this.trail;
      // Pool slots recycle out of chronological order. Refresh selection only
      // when births change, keeping the newest trail responsive at capacity.
      if (this._birthVersion !== a.birth.version) {
        this._birthVersion = a.birth.version;
        this._roseOrder.length = roses.geometry.instanceCount;
        for (let i = 0; i < this._roseOrder.length; i++) this._roseOrder[i] = i;
        this._roseOrder.sort(this._newestFirst);
      }
      for (let slot = 0; slot < this._roseOrder.length && count < CAPACITY; slot++) {
        const i = this._roseOrder[slot];
        const birth = a.birth.getX(i);
        if (trackingRandom(birth * 1000 + 7) > 0.6) continue;
        const age = Math.max(0, c.clock.value - birth);
        const collapse = trackingSmooth(c.lifetime.value, c.lifetime.value + c.degrowDuration.value, age);
        const emerge = trackingSmooth(0, c.growDuration.value, age);
        const frame = age < c.lifetime.value ? Math.min(age * c.vatFps.value, c.vatEndFrame.value)
          : c.vatEndFrame.value + (FRAMES - 2 - c.vatEndFrame.value) * collapse;
        const f0 = Math.floor(frame), f1 = Math.min(FRAMES - 1, f0 + 1), blend = frame - f0;
        const target = this.targets[count];
        const point = target.position;
        point.fromArray(this._stemFrames, f0 * 3);
        point.x += (this._stemFrames[f1 * 3] - point.x) * blend;
        point.y += (this._stemFrames[f1 * 3 + 1] - point.y) * blend;
        point.z += (this._stemFrames[f1 * 3 + 2] - point.z) * blend;
        const angle = a.variation.getX(i), scale = a.variation.getY(i);
        const leanX = a.variation.getZ(i), leanZ = a.variation.getW(i);
        const x = point.x * Math.cos(leanZ) - point.y * Math.sin(leanZ);
        const y = point.x * Math.sin(leanZ) + point.y * Math.cos(leanZ);
        const z = y * Math.sin(leanX) + point.z * Math.cos(leanX);
        point.y = (y * Math.cos(leanX) - point.z * Math.sin(leanX)) * scale + c.waterY.value
          - (1 - emerge + collapse) * c.emergenceDepth.value;
        point.x = (x * Math.cos(angle) - z * Math.sin(angle)) * scale + a.offset.getX(i);
        point.z = (x * Math.sin(angle) + z * Math.cos(angle)) * scale + a.offset.getY(i);
        target.size = 22 + trackingRandom(birth * 1000 + 11) * 17;
        target.opacity = emerge * (1 - collapse) * trackingSmooth(c.waterY.value, c.waterY.value + 0.35, point.y);
        count++;
      }
    }
    this.overlay.update(camera, viewport, this.targets, count, this.corners, this.solids);
  }

  dispose() { this.overlay.dispose(); }
}
