import {
  DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh,
  Matrix4, MeshBasicNodeMaterial, PlaneGeometry, Vector3,
} from "three/webgpu";
import { Fn, attribute, float, fwidth, mix, smoothstep, uv } from "three/tsl";
import { MeshLine } from "makio-meshline";
import { BatchedMSDFText } from "three-blocks/msdf-text";
import { loadMSDFFont } from "../utils/msdfFont.js";
import { segmentIntersectsBounds, trackingRandom } from "./trackingMath.js";

/** Scene-independent world anchors → three fixed-capacity draws.
 * Targets: { position: Vector3, opacity: number, size: CSS pixels }.
 * Call update immediately before the main scene render, outside reflection passes.
 * Supply a projected exclusion polygon (world-space corners) and solid Box3s.
 * The polygon's conservative screen rectangle protects content even through holes.
 */
export class TrackingOverlay extends Group {
  constructor({ capacity = 24, maxLinks = 20, maxLinkPixels = 360 } = {}) {
    super();
    this.name = "Tracking overlay";
    this.capacity = capacity;
    this.maxLinks = maxLinks;
    this.maxLinkPixels = maxLinkPixels;
    this._disposed = false;
    this._matrix = new Matrix4();
    this._scale = new Vector3();
    this._point = new Vector3();
    this._labelPoint = new Vector3();
    this._right = new Vector3();
    this._up = new Vector3();
    this._min = new Vector3();
    this._max = new Vector3();
    this._projected = Array.from({ length: capacity }, () => new Vector3());
    this._visible = new Uint8Array(capacity);
    this._degree = new Uint8Array(capacity);
    this._alpha = new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);

    const geometry = new PlaneGeometry(1, 1);
    geometry.setAttribute("trackingAlpha", this._alpha);
    const material = new MeshBasicNodeMaterial({
      color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    });
    // Signed distance to a square, plus a small central crosshair. Derivatives
    // keep the strokes crisp at ~one physical pixel without extra geometry.
    const p = uv().sub(0.5).abs();
    const aa = fwidth(p.x).max(fwidth(p.y)).max(0.0001);
    const boxDistance = p.x.max(p.y).sub(0.38).abs();
    const box = float(1).sub(smoothstep(aa.mul(0.35), aa.mul(1.35), boxDistance));
    const crossDistance = p.x.min(p.y);
    const cross = float(1).sub(smoothstep(aa.mul(0.25), aa.mul(1.1), crossDistance))
      .mul(float(1).sub(smoothstep(0.08, 0.11, p.x.max(p.y))));
    material.opacityNode = box.max(cross).mul(attribute("trackingAlpha"));
    this.markers = new InstancedMesh(geometry, material, capacity);
    this.markers.instanceMatrix.setUsage(DynamicDrawUsage);
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 20;
    this.markers.count = 0;
    this.add(this.markers);

    this._starts = new InstancedBufferAttribute(new Float32Array(maxLinks * 3), 3).setUsage(DynamicDrawUsage);
    this._ends = new InstancedBufferAttribute(new Float32Array(maxLinks * 3), 3).setUsage(DynamicDrawUsage);
    this._lineAlpha = new InstancedBufferAttribute(new Float32Array(maxLinks), 1).setUsage(DynamicDrawUsage);
    this.lines = new MeshLine().segments(1).instances(maxLinks)
      .gpuPositionNode(Fn(([t]) => mix(attribute("trackingStart", "vec3"), attribute("trackingEnd", "vec3"), t)))
      .opacityFn(Fn(([alpha]) => alpha.mul(attribute("trackingLineAlpha"))))
      .color(0xffffff).opacity(0.48).transparent(true)
      .lineWidth(0.8).sizeAttenuation(false).setFrustumCulled(false).build();
    // Keep MeshLine's object.count fixed for Three's shader cache, and vary
    // the native instance draw range instead (including zero/one-link frames).
    const lineGeometry = this.lines.geometry;
    this.lines.geometry = new InstancedBufferGeometry().copy(lineGeometry);
    lineGeometry.dispose();
    this.lines.geometry.setAttribute("trackingStart", this._starts);
    this.lines.geometry.setAttribute("trackingEnd", this._ends);
    this.lines.geometry.setAttribute("trackingLineAlpha", this._lineAlpha);
    this.lines.material.depthWrite = false;
    this.lines.material.toneMapped = false;
    this.lines.renderOrder = 19;
    this.lines.geometry.instanceCount = 0;
    this.add(this.lines);

    this.ready = loadMSDFFont().then(({ font, map }) => {
      if (this._disposed) return;
      this.labels = new BatchedMSDFText({ font, map, maxTextCount: capacity, maxGlyphCount: capacity * 6 });
      this.labels.frustumCulled = false;
      this.labels.material.depthTest = false;
      this.labels.material.depthWrite = false;
      this.labels.material.toneMapped = false;
      this.labels.renderOrder = 21;
      for (let i = 0; i < capacity; i++) {
        this.labels.addText({ text: trackingRandom(i + 91).toFixed(3), fontSize: 1, opacity: 0, anchorY: "middle" });
      }
      this.labels.update();
      this.add(this.labels);
    });
  }

  update(camera, viewport, targets, count, exclusionCorners = [], solids = []) {
    const n = Math.min(count, this.capacity);
    const width = viewport.width, height = viewport.height;
    this._min.set(Infinity, Infinity, Infinity);
    this._max.set(-Infinity, -Infinity, -Infinity);
    for (const corner of exclusionCorners) {
      this._point.copy(corner).project(camera);
      this._min.min(this._point);
      this._max.max(this._point);
    }
    // Extra clearance includes half a line width at every viewport/DPR.
    this._min.x -= 6 / width; this._min.y -= 6 / height;
    this._max.x += 6 / width; this._max.y += 6 / height;
    const blocked = exclusionCorners.length > 0;
    this._right.setFromMatrixColumn(camera.matrixWorld, 0);
    this._up.setFromMatrixColumn(camera.matrixWorld, 1);
    this._visible.fill(0);
    this._degree.fill(0);
    for (let i = 0; i < this.capacity; i++) {
      const target = targets[i];
      let alpha = i < n ? target.opacity : 0;
      if (alpha > 0.01) {
        const point = this._projected[i].copy(target.position).project(camera);
        const half = target.size / 2;
        // Include the tiny label in the exclusion footprint; never print on a project.
        if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 0.98 || Math.abs(point.y) > 0.98 ||
          (blocked && point.x + (half + 38) * 2 / width >= this._min.x &&
            point.x - half * 2 / width <= this._max.x &&
            point.y + half * 2 / height >= this._min.y && point.y - half * 2 / height <= this._max.y)) alpha = 0;
        for (let j = 0; j < i && alpha > 0; j++) {
          if (!this._visible[j]) continue;
          const other = this._projected[j];
          const spacing = (target.size + targets[j].size) * 0.5 + 6;
          if (((point.x - other.x) * width * 0.5) ** 2 + ((point.y - other.y) * height * 0.5) ** 2 < spacing ** 2) alpha = 0;
        }
        if (alpha > 0) {
          const depth = -this._point.copy(target.position).applyMatrix4(camera.matrixWorldInverse).z;
          const units = 2 * depth / (camera.projectionMatrix.elements[5] * height);
          const size = target.size * units;
          this._scale.set(size, size, size);
          this._matrix.compose(target.position, camera.quaternion, this._scale);
          this.markers.setMatrixAt(i, this._matrix);
          this._labelPoint.copy(target.position).addScaledVector(this._right, (half + 3) * units)
            .addScaledVector(this._up, half * 0.62 * units);
          this._scale.setScalar(8 * units);
          this._matrix.compose(this._labelPoint, camera.quaternion, this._scale);
          this.labels?.setMatrixAt(i, this._matrix);
          this._visible[i] = 1;
        }
      }
      this._alpha.setX(i, alpha);
      this.labels?.setOpacityAt(i, alpha * 0.72);
    }
    this.markers.count = n;
    this.markers.instanceMatrix.needsUpdate = true;
    this._alpha.needsUpdate = true;

    let links = 0;
    // Bounded nearest-neighbour graph. Earlier targets are eligible peers;
    // maximum degree two keeps it sparse and avoids a bright central star.
    for (let i = 1; i < n && links < this.maxLinks; i++) {
      if (!this._visible[i]) continue;
      let nearest = -1, best = this.maxLinkPixels ** 2;
      for (let j = 0; j < i; j++) {
        if (!this._visible[j] || this._degree[j] >= 2) continue;
        const a = this._projected[i], b = this._projected[j];
        const distance = ((a.x - b.x) * width * 0.5) ** 2 + ((a.y - b.y) * height * 0.5) ** 2;
        if (distance < 24 ** 2 || distance >= best) continue;
        if (blocked && segmentIntersectsBounds(a, b, this._min, this._max, 2)) continue;
        let solidHit = false;
        for (const solid of solids) {
          if (segmentIntersectsBounds(targets[i].position, targets[j].position, solid.min, solid.max)) { solidHit = true; break; }
        }
        if (solidHit) continue;
        nearest = j; best = distance;
      }
      if (nearest === -1) continue;
      const a = targets[i], b = targets[nearest];
      this._starts.setXYZ(links, a.position.x, a.position.y, a.position.z);
      this._ends.setXYZ(links, b.position.x, b.position.y, b.position.z);
      this._lineAlpha.setX(links, Math.min(a.opacity, b.opacity));
      this._degree[i]++; this._degree[nearest]++; links++;
    }
    this.lines.geometry.instanceCount = links;
    this.lines.visible = links > 0;
    this.lines.renderSize(width, height);
    this._starts.needsUpdate = this._ends.needsUpdate = this._lineAlpha.needsUpdate = true;
  }

  dispose() {
    this._disposed = true;
    this.markers.geometry.dispose();
    this.markers.material.dispose();
    this.markers.dispose();
    this.lines.dispose();
    this.labels?.dispose();
    this.clear();
  }
}
