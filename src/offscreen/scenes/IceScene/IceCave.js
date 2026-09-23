import { BufferGeometry, Float32BufferAttribute, Group, Mesh, IcosahedronGeometry } from "three/webgpu";
import { createIceMaterial } from "./iceMaterial.js";

export class IceCave extends Group {
  constructor(options, groundY, shape = {}) {
    super();
    this.name = "IceCave";
    this._groundY = groundY;
    const { material, controls } = createIceMaterial(options);
    this.material = material;
    this.controls = controls;
    this._rockGeometry = new IcosahedronGeometry(1, 3);
    this.rebuild(shape);
  }

  rebuild(shape = {}) {
    this._shape = { ...this._shape, ...shape };
    const keep = new Set([this._rockGeometry]);
    while (this.children.length) {
      const child = this.children[0];
      this.remove(child);
      if (child.geometry && !keep.has(child.geometry)) child.geometry.dispose();
    }
    this._buildShell();
    this._buildRocks();
  }

  _buildShell() {
    const {
      frontZ = 85,
      length = 245,
      width = 35,
      height = 45,
      taper = 0.56,
      bend = 5,
      ridgeStrength = 1,
      uvRepeatX = 7,
      uvRepeatY = 16,
      floorY = this._groundY,
      floorRadius = 10,
    } = this._shape;
    const groundY = this._groundY;
    // Resolve the curved ribs with several vertices per ripple instead of
    // sampling the fine ridges at almost one triangle per wave.
    const rings = 128;
    const sides = 96;
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let j = 0; j <= rings; j++) {
      const z = frontZ - (j / rings) * length;
      const taperAmt = 1 - taper * Math.max(0, Math.min(1, -z / Math.max(1, length - frontZ)));
      const bendAmt = Math.sin(z * 0.018) * bend;
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI;
        const ridge =
          Math.sin(a * 7 + z * 0.09) * 1.25 +
          Math.sin(a * 13 - z * 0.14) * 0.3 +
          Math.sin(a * 3 + z * 0.04) * 2.0;
        const w = Math.max(1, width + ridge * ridgeStrength) * Math.max(0.08, taperAmt);
        const h = Math.max(1, height + ridge * ridgeStrength * 1.7) * Math.max(0.08, taperAmt);
        let x = bendAmt + Math.cos(a) * w;
        let y = groundY + Math.sin(a) * h - 0.6;
        // Roll the wall inward until it meets the actual floor tangentially.
        // The upper arch stays in place when the floor height changes.
        if (floorRadius > 0) {
          const baseY = groundY - 0.6;
          const radius = Math.max(floorRadius, (floorY - baseY) * 0.55);
          const joinY = Math.max(floorY + radius, baseY + 0.1);
          if (y < joinY) {
            const t = Math.max(0, Math.min(1, (y - baseY) / (joinY - baseY)));
            const startY = floorY - 0.04;
            const rise = joinY - startY;
            const slope = joinY - baseY;
            // Cubic Hermite: horizontal at the foot, original slope at join.
            y = startY + (3 * rise - slope) * t * t + (slope - 2 * rise) * t * t * t;
            x -= Math.sign(Math.cos(a)) * radius * (1 - t) ** 2;
          }
        }
        positions.push(x, y, z);
        uvs.push((i / sides) * uvRepeatX, (j / rings) * uvRepeatY);
        if (i < sides && j < rings) {
          const k = j * (sides + 1) + i;
          indices.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1);
        }
      }
    }

    const shell = new BufferGeometry();
    shell.setAttribute("position", new Float32BufferAttribute(positions, 3));
    shell.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    shell.setIndex(indices);
    shell.computeVertexNormals();
    shell.computeTangents();
    this.add(new Mesh(shell, this.material));
  }

  _buildRocks() {
    const { frontZ = 85, length = 245, width = 35, taper = 0.56, rockCount = 58, rockScale = 1 } = this._shape;
    const groundY = this._groundY;
    const random = (i) => {
      const n = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const span = length * 0.72;
    for (let i = 0; i < rockCount; i++) {
      const side = i % 2 ? 1 : -1;
      const z = frontZ - 17 - Math.floor(i / 2) * (span / Math.max(1, Math.ceil(rockCount / 2))) + random(i + 20) * 9;
      const taperAmt = 1 - taper * Math.max(0, Math.min(1, -z / Math.max(1, length - frontZ)));
      const rock = new Mesh(this._rockGeometry, this.material);
      rock.position.set(
        side * (width * 0.83 * taperAmt + random(i + 50) * 6 - 3),
        groundY - 0.7,
        z,
      );
      rock.scale.set(2 + random(i) * 5, 1.1 + random(i + 9) ** 2 * 7, 2 + random(i + 7) * 6);
      rock.scale.multiplyScalar(rockScale);
      rock.rotation.set(i * 0.31, i * 1.7, i * 0.17);
      this.add(rock);
    }
  }

  dispose() {
    const geometries = new Set([this._rockGeometry]);
    this.traverse((obj) => {
      if (obj.geometry) geometries.add(obj.geometry);
    });
    for (const geometry of geometries) geometry.dispose();
    this.material.dispose();
  }
}
