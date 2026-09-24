import { Color, Mesh, MeshBasicNodeMaterial, PlaneGeometry, InstancedBufferGeometry,
  InstancedBufferAttribute, DoubleSide, AdditiveBlending, Vector2 } from 'three/webgpu';
import { Fn, If, attribute, uniform, vec2, vec3, floor, fract, sin,
  exp, cos, smoothstep, uv, cameraWorldMatrix } from 'three/tsl';

const COLUMNS = 64;
const ROWS = 48;
const hash = (p) => fract(sin(p.dot(vec2(127.1, 311.7))).mul(43758.5453));
const jitter = (p) => vec2(hash(p), hash(p.add(vec2(37.2, 91.7))));

/** GPU rain and water share a deterministic event clock: a drop reaching the
 * surface starts the next expanding ring at exactly the same world position.
 * One instanced draw, no per-frame particle uploads or collision/depth passes.
 */
export class MeadowRain {
  constructor(settings) {
    this.controls = {};
    for (const key of ['rainIntensity', 'rainSpeed', 'rainHeight', 'rainCellSize',
      'rainLength', 'rainWidth', 'rainOpacity', 'rainWind',
      'rippleStrength', 'rippleRadius', 'rippleLifetime']) this.controls[key] = uniform(settings[key]);
    this.controls.rainColor = uniform(new Color(settings.rainColor));
    this.clock = uniform(0);
    this.origin = uniform(new Vector2());
    this.waterY = uniform(settings.waterY);
    this.configure(settings);
    const u = this.controls;
    const base = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.attributes = base.attributes;
    geometry.instanceCount = COLUMNS * ROWS;
    const cells = new Float32Array(COLUMNS * ROWS * 2);
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLUMNS; x++) {
      cells[(z * COLUMNS + x) * 2] = x;
      cells[(z * COLUMNS + x) * 2 + 1] = z;
    }
    geometry.setAttribute('rainCell', new InstancedBufferAttribute(cells, 2));
    const cell = attribute('rainCell', 'vec2');
    const event = this.event(cell);
    const landing = this.point(cell, event.cycle.add(1));
    const height = event.phase.oneMinus().mul(u.rainHeight);
    const material = new MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
    });
    // Quad extends upward from the leading tip, never below the water.
    const y = height.add(uv().y.mul(u.rainLength));
    material.positionNode = vec3(landing.x.add(y.mul(u.rainWind)), this.waterY.add(y), landing.y)
      .add(cameraWorldMatrix[0].xyz.mul(uv().x.sub(0.5)).mul(u.rainWidth));
    const profile = smoothstep(0, 0.25, uv().x).mul(smoothstep(0, 0.25, uv().x.oneMinus()))
      .mul(uv().y.oneMinus().pow(1.5));
    material.opacityNode = profile.mul(u.rainOpacity).mul(this.active(cell))
      .mul(smoothstep(0, 0.3, height)).mul(smoothstep(0, 2, u.rainHeight.sub(height)));
    // Rain stays legible through its additive color/opacity and is deliberately
    // independent of the tile screen's area light.
    material.colorNode = u.rainColor;
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'Meadow rain';
    this.mesh.frustumCulled = false; // GPU positions span the configured rain volume.
    this.mesh.renderOrder = 1;
  }

  configure(p) {
    this.origin.value.set(p.wallX - COLUMNS * this.controls.rainCellSize.value * 0.5,
      p.wallZ + p.wallDepth * 0.5 + 0.5);
    this.waterY.value = p.waterY;
  }

  event(cell) {
    const period = this.controls.rainHeight.div(this.controls.rainSpeed);
    const t = this.clock.div(period).add(hash(cell.add(17)));
    return { cycle: floor(t), phase: fract(t), period };
  }

  point(cell, cycle) {
    return cell.add(jitter(cell.add(cycle.mul(vec2(13.7, 29.3)))).mul(0.7).add(0.15))
      .mul(this.controls.rainCellSize).add(this.origin);
  }

  active(cell) {
    return hash(cell.add(53)).lessThan(this.controls.rainIntensity)
      .and(cell.x.greaterThanEqual(0)).and(cell.x.lessThan(COLUMNS))
      .and(cell.y.greaterThanEqual(0)).and(cell.y.lessThan(ROWS));
  }

  /** Analytic radial slopes, like the reference's normal perturbation. Nine
   * neighboring cells avoid seams as rings cross cell edges; work stays bounded.
   * XY = water-normal slopes, Z = brief impact froth (also screen-lit).
   */
  ripples(worldXZ) {
    const u = this.controls;
    return Fn(() => {
      const result = vec3(0).toVar();
      const cell = floor(worldXZ.sub(this.origin).div(u.rainCellSize));
      If(u.rainIntensity.greaterThan(0).and(u.rippleStrength.greaterThan(0)), () => {
        for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
          const neighbor = cell.add(vec2(x, z));
          const event = this.event(neighbor);
          const age = event.phase.mul(event.period);
          const lifetime = u.rippleLifetime.min(event.period.mul(0.95));
          If(this.active(neighbor).and(age.lessThan(lifetime)), () => {
            const progress = age.div(lifetime);
            const offset = worldXZ.sub(this.point(neighbor, event.cycle));
            const radius = offset.length().max(0.001);
            const wave = radius.sub(progress.mul(u.rippleRadius.min(u.rainCellSize.mul(0.8))));
            const packet = exp(wave.div(0.13).pow(2).negate())
              .mul(progress.oneMinus().pow(2)).mul(smoothstep(0, 0.045, age));
            const slope = cos(wave.mul(32)).mul(packet).mul(u.rippleStrength);
            const impact = exp(radius.mul(radius).mul(-55)).mul(exp(age.mul(-18)));
            result.addAssign(vec3(offset.div(radius).mul(slope), impact.mul(0.2).add(packet.mul(0.045)).mul(u.rippleStrength)));
          });
        }
      });
      return result;
    })();
  }

  update(timeMs) { this.clock.value = timeMs * 0.001; }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
