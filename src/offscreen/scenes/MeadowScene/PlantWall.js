import { Group, Mesh, PlaneGeometry, MeshStandardNodeMaterial, DoubleSide,
  Color, Vector3, DataTexture, RGBAFormat, LinearFilter } from 'three/webgpu';
import { attribute, uniform, texture, normalMap, positionLocal, positionWorld,
  smoothstep, mix, vec2, vec3, float, fract, sin, cos, exp, step,
  Fn, If, Discard } from 'three/tsl';

const PROFILE_SIZE = 256;
const hash = value => fract(sin(value.mul(127.1).add(311.7)).mul(43758.5453));

/** One atlas material/draw for the garden; loader owns shared geometry/textures. */
export class PlantWall extends Group {
  constructor(asset, screenLight, settings, rain) {
    super();
    this.name = 'PlantWall';
    this.controls = {
      leafTint: uniform(new Color(settings.leafTint)),
      leafRoughness: uniform(settings.leafRoughness),
      leafNormalStrength: uniform(settings.leafNormalStrength),
      leafWindStrength: uniform(settings.leafWindStrength),
      leafWindSpeed: uniform(settings.leafWindSpeed),
      leafRainRustle: uniform(settings.leafRainRustle),
      leafRainCoverage: uniform(settings.leafRainCoverage),
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
      const motion = attribute('color', 'vec4');
      const pivot = motion.xyz.sub(vec3(0.5, 0, 0.5));
      const offset = positionLocal.sub(pivot);
      const seed = hash(pivot.dot(vec3(37.1, 91.7, 53.3)));
      const leafMask = motion.a;

      // COLOR_0 stores a shared component pivot, so every vertex in one leaf
      // receives the same angles. The shader performs two tiny rotations in
      // the existing foliage draw; the backing and stem slots remain rigid.
      const windPhase = rain.clock.mul(c.leafWindSpeed)
        .add(pivot.x.mul(13)).add(pivot.y.mul(7)).add(seed.mul(6.283));
      const windAngle = sin(windPhase).add(sin(windPhase.mul(0.37).add(2.1)).mul(0.35))
        .mul(c.leafWindStrength).mul(mix(0.35, 1, hash(seed.add(7)))).mul(leafMask);

      // Sparse impacts share the rain clock and fall period. They push a leaf
      // down once, then add a short damped flutter as it settles.
      const fallPeriod = rain.controls.rainHeight.div(rain.controls.rainSpeed.max(0.001));
      const hitAge = fract(rain.clock.div(fallPeriod).add(seed));
      const selected = step(float(1).sub(c.leafRainCoverage), hash(seed.add(19)))
        .mul(rain.controls.rainIntensity).mul(leafMask);
      const hitEnvelope = exp(hitAge.mul(-6)).mul(smoothstep(0, 0.04, hitAge)).mul(selected);
      const rainAngle = sin(hitAge.mul(28)).mul(hitEnvelope).mul(c.leafRainRustle);

      const windCos = cos(windAngle);
      const windSin = sin(windAngle);
      const windOffset = vec3(
        offset.x.mul(windCos).sub(offset.y.mul(windSin)),
        offset.x.mul(windSin).add(offset.y.mul(windCos)),
        offset.z,
      );
      const rainCos = cos(rainAngle);
      const rainSin = sin(rainAngle);
      const rustledOffset = vec3(
        windOffset.x,
        windOffset.y.mul(rainCos).sub(windOffset.z.mul(rainSin)),
        windOffset.y.mul(rainSin).add(windOffset.z.mul(rainCos)),
      );
      const downward = hitEnvelope.mul(c.leafRainRustle).mul(offset.length()).mul(0.35);
      material.positionNode = pivot.add(rustledOffset).sub(vec3(0, downward, 0));
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
