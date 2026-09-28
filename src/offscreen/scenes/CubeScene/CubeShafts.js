import * as THREE from "three/webgpu";
import {
  Fn,
  abs,
  attribute,
  cameraPosition,
  clamp,
  cross,
  dot,
  float,
  length,
  max,
  mix,
  mx_noise_float,
  normalize,
  positionGeometry,
  positionWorld,
  pow,
  select,
  sign,
  smoothstep,
  step,
  uniform,
  vec3,
} from "three/tsl";
import { travelingGlowField } from "./CubeWalls.js";

// Surfaces that can emit, as [axis, side] in room box coords. The front wall
// sits behind the camera and is skipped.
const SURFACES = [
  [2, -1], // back
  [1, -1], // floor
  [1, 1], // ceiling
  [0, -1], // left
  [0, 1], // right
];
const EDGE_MARGIN = 0.85;
// Roots stay behind this room-box z so floor/ceiling/side beams never wrap
// the camera.
const NEAR_LIMIT = -0.2;

/**
 * CubeShafts - volumetric light shafts where the glow behind the walls peaks.
 *
 * Each shaft is a flared cone rooted on a wall's base plane and pointed into
 * the room. Its brightness is the same traveling glow field that lights the
 * shell and the gaps, sampled at the root and thresholded, so beams only
 * appear while a hotspot passes over them. Beams below threshold collapse to
 * a point in the vertex stage and cost no fill.
 */
export class CubeShafts extends THREE.Mesh {
  /**
   * @param {Object} options
   * @param {import("./CubeWalls.js").CubeWalls} options.walls
   * @param {Object} options.settings - CubeScene.Shafts param values
   */
  constructor({ walls, settings, maxCount = 128 }) {
    const cone = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    cone.translate(0, 0.5, 0);
    const geometry = new THREE.InstancedBufferGeometry().copy(cone);
    cone.dispose();
    geometry.deleteAttribute("normal");
    geometry.deleteAttribute("uv");

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    material.name = "CubeShafts";

    super(geometry, material);
    this.name = "CubeShafts";
    this.frustumCulled = false;
    this.renderOrder = 1;
    this.maxCount = maxCount;

    this.uniforms = {
      shaftIntensity: uniform(settings.shaftIntensity),
      shaftThreshold: uniform(settings.shaftThreshold),
      shaftSoftness: uniform(settings.shaftSoftness),
      shaftLength: uniform(settings.shaftLength),
      shaftRadius: uniform(settings.shaftRadius),
      shaftSpread: uniform(settings.shaftSpread),
      shaftTilt: uniform(settings.shaftTilt),
      shaftStart: uniform(settings.shaftStart),
      shaftFalloff: uniform(settings.shaftFalloff),
      shaftEdge: uniform(settings.shaftEdge),
      shaftStreaks: uniform(settings.shaftStreaks),
      shaftStreakScale: uniform(settings.shaftStreakScale),
      shaftDrift: uniform(settings.shaftDrift),
    };

    this._createInstances(walls.roomSize);
    this._setupMaterial(walls.uniforms);
    this.setCount(settings.shaftCount);
    this.visible = settings.shaftsEnabled;
  }

  setCount(count) {
    this.geometry.instanceCount = Math.min(Math.max(0, Math.round(count)), this.maxCount);
  }

  /** Random roots on the emitting surfaces, weighted by area. */
  _createInstances(roomSize) {
    const size = roomSize.toArray();
    const areas = SURFACES.map(([axis]) => {
      const [a, b] = [0, 1, 2].filter((i) => i !== axis);
      return size[a] * size[b];
    });
    const total = areas.reduce((sum, area) => sum + area, 0);

    const place = new Float32Array(this.maxCount * 4);
    const jitter = new Float32Array(this.maxCount * 4);
    for (let i = 0; i < this.maxCount; i++) {
      let pick = Math.random() * total;
      let s = 0;
      while (pick > areas[s] && s < SURFACES.length - 1) pick -= areas[s++];
      const [axis, side] = SURFACES[s];
      const [a, b] = [0, 1, 2].filter((k) => k !== axis);

      const p = [0, 0, 0];
      p[axis] = side;
      p[a] = (Math.random() * 2 - 1) * EDGE_MARGIN;
      p[b] = (Math.random() * 2 - 1) * EDGE_MARGIN;
      if (axis !== 2) p[2] = -EDGE_MARGIN + Math.random() * (EDGE_MARGIN + NEAR_LIMIT);

      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      const j = [0, 0, 0];
      j[a] = Math.cos(angle) * r;
      j[b] = Math.sin(angle) * r;

      place.set([...p, Math.random()], i * 4);
      jitter.set([...j, 0.6 + Math.random() * 0.8], i * 4);
    }
    this.geometry.setAttribute("instancePlace", new THREE.InstancedBufferAttribute(place, 4));
    this.geometry.setAttribute("instanceJitter", new THREE.InstancedBufferAttribute(jitter, 4));
  }

  _setupMaterial(w) {
    const u = this.uniforms;
    const place = attribute("instancePlace", "vec4");
    const jitter = attribute("instanceJitter", "vec4");

    const keepOut = max(w.depthMax.add(w.faceBulge).add(w.cornerInset), 0);
    const half = w.roomSize.mul(0.5).add(vec3(keepOut, 0, keepOut));
    const root = w.roomCenter.add(place.xyz.mul(half)).toVar();
    const inward = step(0.999, abs(place.xyz)).mul(sign(place.xyz)).negate();
    const axis = normalize(inward.add(jitter.xyz.mul(u.shaftTilt))).toVar();
    const helper = select(abs(axis.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0));
    const tangent = normalize(cross(axis, helper));
    // tangent × axis keeps the cone's winding, so FrontSide stays the near wall.
    const bitangent = cross(tangent, axis);

    const field = travelingGlowField(w.glowNoiseScale, w.glowNoiseSpeed, w.time, root);
    const hot = pow(clamp(field, 0, 1), w.glowContrast);
    const strength = smoothstep(u.shaftThreshold, u.shaftThreshold.add(u.shaftSoftness), hot).toVar();

    const t = positionGeometry.y;
    const radial = tangent.mul(positionGeometry.x).add(bitangent.mul(positionGeometry.z));
    const radius = u.shaftRadius.mul(jitter.w).mul(mix(1, u.shaftSpread, t));
    const world = root.add(axis.mul(t.mul(u.shaftLength))).add(radial.mul(radius));
    this.material.positionNode = select(strength.greaterThan(0.001), world, root);

    const vT = t.toVarying("v_shaftT");
    const vStrength = strength.toVarying("v_shaftStrength");
    const vRadial = radial.toVarying("v_shaftRadial");
    const vAxis = axis.toVarying("v_shaftAxis");
    const vCircle = positionGeometry.xz.toVarying("v_shaftCircle");
    const vSeed = place.w.toVarying("v_shaftSeed");

    this.material.colorNode = Fn(() => {
      const toCamera = cameraPosition.sub(positionWorld);
      const view = normalize(toCamera);
      const beamAxis = normalize(vAxis);
      const across = view.sub(beamAxis.mul(dot(view, beamAxis)));
      const sinTheta = length(across).max(1e-3);
      // Chord through the cone's cross-section, stretched by 1/sin(theta) as
      // the view lines up with the beam.
      const chord = clamp(dot(normalize(vRadial), across.div(sinTheta)), 0, 1);
      const thickness = pow(chord, u.shaftEdge).div(sinTheta.max(0.3));

      const profile = smoothstep(0, u.shaftStart, vT).mul(pow(vT.oneMinus(), u.shaftFalloff));
      const noise = mx_noise_float(vec3(
        vCircle.mul(u.shaftStreakScale),
        vT.mul(1.5).sub(w.time.mul(u.shaftDrift)).add(vSeed.mul(17)),
      ));
      const streak = mix(float(1), smoothstep(-0.25, 0.6, noise), u.shaftStreaks);
      const nearFade = smoothstep(2, 14, length(toCamera));

      return w.glowColor.mul(
        u.shaftIntensity.mul(vStrength).mul(thickness).mul(profile).mul(streak).mul(nearFade),
      );
    })();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
