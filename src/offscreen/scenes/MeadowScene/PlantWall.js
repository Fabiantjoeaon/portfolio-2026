import { Group, Mesh, PlaneGeometry, MeshStandardNodeMaterial, DoubleSide,
  Color, Vector3, DataTexture, RGBAFormat, LinearFilter } from 'three/webgpu';
import { uniform, texture, normalMap, positionWorld, smoothstep, mix, vec2, Fn, If, Discard } from 'three/tsl';

const PROFILE_SIZE = 256;

/** One atlas material/draw for the garden; loader owns shared geometry/textures. */
export class PlantWall extends Group {
  constructor(asset, screenLight, settings) {
    super();
    this.name = 'PlantWall';
    this.controls = {
      leafTint: uniform(new Color(settings.leafTint)),
      leafRoughness: uniform(settings.leafRoughness),
      leafNormalStrength: uniform(settings.leafNormalStrength),
      plantLightStrength: uniform(settings.plantLightStrength),
      waterLevel: uniform(settings.waterY),
      reflectionPass: uniform(0),
    };
    this.profile = new DataTexture(new Uint8Array(PROFILE_SIZE * 4), PROFILE_SIZE, 1, RGBAFormat);
    this.profile.minFilter = this.profile.magFilter = LinearFilter;
    this.materials = [];
    this._triangles = [];
    const model = asset.scene.clone(true);
    model.updateMatrixWorld(true);
    model.traverse(mesh => {
      if (!mesh.isMesh) return;
      const original = mesh.material;
      const c = this.controls;
      const material = new MeshStandardNodeMaterial({
        side: DoubleSide, alphaTest: 0.45, alphaToCoverage: true,
      });
      const leaf = texture(original.map);
      const wet = smoothstep(c.waterLevel, c.waterLevel.add(2), positionWorld.y);
      material.colorNode = leaf.rgb.mul(c.leafTint).mul(mix(0.48, 1, wet));
      material.opacityNode = Fn(() => {
        // Don't reflect submerged leaves above the water line.
        If(c.reflectionPass.greaterThan(0.5).and(positionWorld.y.lessThan(c.waterLevel)), () => { Discard(); });
        return leaf.a;
      })();
      material.roughnessNode = c.leafRoughness.mul(mix(0.65, 1, wet));
      if (original.normalMap) material.normalNode = normalMap(texture(original.normalMap), vec2(c.leafNormalStrength));
      screenLight?.applyTo(material, {
        baseColor: material.colorNode, roughness: material.roughnessNode,
        side: 'back', intensityScale: c.plantLightStrength,
      });
      mesh.material = material;
      this.materials.push(material);
      // Cache normalized triangles once. Submersion edits rebuild a tiny contact
      // profile on the CPU; no depth pass or geometry work during animation.
      const { position } = mesh.geometry.attributes;
      const index = mesh.geometry.index;
      const count = index?.count ?? position.count;
      const points = new Float32Array(count * 3);
      const p = new Vector3();
      for (let i = 0; i < count; i++) {
        p.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
        p.toArray(points, i * 3);
      }
      this._triangles.push(points);
    });
    this.add(model);
    // An opaque, almost black backing closes tiny gaps between cutout leaves.
    const backingMaterial = new MeshStandardNodeMaterial({ color: 0x080f0b, roughness: 0.95, side: DoubleSide });
    screenLight?.applyTo(backingMaterial, {
      baseColor: uniform(new Color(0x080f0b)), roughness: 0.95,
      side: 'back', intensityScale: this.controls.plantLightStrength,
    });
    this.backing = new Mesh(new PlaneGeometry(1, 1), backingMaterial);
    this.backing.position.set(0, 0.5, -0.38);
    this.add(this.backing);
    this.materials.push(backingMaterial);
    this.configure(settings);
  }

  configure(p) {
    this.position.set(p.wallX, p.waterY - p.submersion, p.wallZ);
    this.scale.set(p.wallWidth, p.wallHeight, p.wallDepth);
    this.controls.waterLevel.value = p.waterY;
    const level = p.submersion / p.wallHeight;
    if (level === this._profileLevel) return;
    this._profileLevel = level;
    const front = new Float32Array(PROFILE_SIZE).fill(-0.38);
    for (const points of this._triangles) {
      for (let t = 0; t < points.length; t += 9) {
        const y0 = points[t + 1], y1 = points[t + 4], y2 = points[t + 7];
        if (Math.min(y0, y1, y2) > level || Math.max(y0, y1, y2) <= level) continue;
        const intersections = [];
        for (let edge = 0; edge < 3; edge++) {
          const a = t + edge * 3, b = t + ((edge + 1) % 3) * 3;
          const ay = points[a + 1], by = points[b + 1];
          if ((ay <= level && by > level) || (by <= level && ay > level)) {
            const f = (level - ay) / (by - ay);
            intersections.push([points[a] + (points[b] - points[a]) * f,
              points[a + 2] + (points[b + 2] - points[a + 2]) * f]);
          }
        }
        if (intersections.length !== 2) continue;
        intersections.sort((a, b) => a[0] - b[0]);
        const [a, b] = intersections;
        const first = Math.max(0, Math.floor((a[0] + 0.5) * PROFILE_SIZE));
        const last = Math.min(PROFILE_SIZE - 1, Math.floor((b[0] + 0.5) * PROFILE_SIZE));
        for (let i = first; i <= last; i++) {
          const x = (i + 0.5) / PROFILE_SIZE - 0.5;
          const f = Math.max(0, Math.min(1, (x - a[0]) / Math.max(1e-6, b[0] - a[0])));
          front[i] = Math.max(front[i], a[1] + (b[1] - a[1]) * f);
        }
      }
    }
    const data = this.profile.image.data;
    for (let i = 0; i < PROFILE_SIZE; i++) {
      data[i * 4] = Math.round((front[i] + 0.5) * 255);
      data[i * 4 + 3] = 255;
    }
    this.profile.needsUpdate = true;
  }

  dispose() {
    this.materials.forEach(m => m.dispose());
    this.backing.geometry.dispose();
    this.profile.dispose();
    this._triangles.length = 0;
  }
}
