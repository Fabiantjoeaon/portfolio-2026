import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";
import {
  Fn,
  positionWorld,
  cameraPosition,
  normalize,
  vec2,
  vec3,
  vec4,
  float,
  atan,
  cos,
  sin,
  exp,
  length,
  mix,
  smoothstep,
  clamp,
} from "three/tsl";
import { perlin3D } from "../../utils/NoiseTexture3D.js";
import { scanShell, vortexScan } from "./vortexScan.js";

// Concentric cloud tubes around the view axis, composited front to back.
// Larger radius = farther along each view ray, so it sits behind the inner ones.
export const TUBES = [
  { radius: 1.0, seed: 0.0, spin: 1.0 },
  { radius: 1.45, seed: 17.3, spin: 0.82 },
  { radius: 2.1, seed: 41.9, spin: 0.66 },
  { radius: 3.0, seed: 73.1, spin: 0.52 },
];

/** Noise-space point of a tube at a flow-aligned angle and view depth. */
export function cloudCoord(u, { angle, depth, radius, seed }) {
  return vec3(
    cos(angle).mul(radius),
    sin(angle).mul(radius),
    depth.add(u.travel).add(u.pageScroll.mul(u.scrollDepth)).mul(u.streak),
  )
    .mul(u.cloudScale)
    .add(seed);
}

/** Reveal mask opening outward from the core; `r` is the radius off the axis. */
export function vortexIris(u, r) {
  const open = mix(float(-0.4), float(1.3), u.reveal);
  return float(1).sub(smoothstep(open.sub(0.4), open, r));
}

export function cloudDensity(p, base = perlin3D(p)) {
  return base
    .add(perlin3D(p.mul(2.03).add(5.2)).mul(0.5))
    .add(perlin3D(p.mul(4.11).add(9.7)).mul(0.25))
    .mul(0.5)
    .add(0.5);
}

/**
 * Backside-sphere backdrop: a slowly swirling cloud vortex receding towards a
 * muted glow. Each view ray is intersected with the tubes analytically
 * (depth = radius / tan(angle off axis)), so depth and parallax cost no marching.
 */
export function createVortexSkyMaterial(u, name = "VortexSky") {
  const material = new NodeMaterial();
  material.name = name;
  material.side = THREE.BackSide;
  material.depthWrite = false;

  material.colorNode = Fn(() => {
    const dir = normalize(positionWorld.sub(cameraPosition));
    const forward = dir.dot(u.axisForward).max(0.05);
    const planar = vec2(dir.dot(u.axisRight), dir.dot(u.axisUp))
      .div(forward)
      .sub(vec2(u.centerX, u.centerY))
      .mul(u.zoom)
      .toVar();
    const r = length(planar).max(0.002).toVar();
    const theta = atan(planar.y, planar.x).toVar();

    const reveal = u.reveal;
    const glow = exp(r.mul(u.glowFalloff).negate())
      .mul(u.glowStrength)
      .mul(reveal);
    const background = mix(vec3(u.deepColor), vec3(u.glowColor), glow)
      .mul(smoothstep(0, 0.6, reveal))
      .toVar();

    const iris = vortexIris(u, r);

    const color = vec3(0).toVar();
    const scanColor = vec3(0).toVar();
    const transmittance = float(1).toVar();

    for (const tube of TUBES) {
      const depth = float(tube.radius).div(r).min(80);
      const angle = theta
        .add(depth.mul(u.twist))
        .add(u.spin.mul(tube.spin));
      const p = cloudCoord(u, { angle, depth, radius: tube.radius, seed: tube.seed });
      const base = perlin3D(p);
      const density = cloudDensity(p, base);

      // Lit on the side facing the core: density falls off towards the light
      const towardsLight = perlin3D(p.add(vec3(0, 0, u.lightOffset)));
      const lit = clamp(base.sub(towardsLight).mul(u.lightGain).add(0.5), 0, 1);
      const thickness = smoothstep(u.coverage, 1, density);
      const shade = lit.mul(float(1).sub(thickness.mul(0.45)));
      const cloud = mix(vec3(u.cloudDark), vec3(u.cloudLight), shade);

      const fog = exp(depth.mul(u.fogDensity).negate());
      const scanLit = vec3(u.scanColor).mul(scanShell(u, depth).mul(u.scanCloudGlow).mul(shade.add(0.3)));
      const tint = mix(background, cloud, fog);
      const alpha = smoothstep(u.coverage, u.coverage.add(u.softness), density)
        .mul(u.cloudOpacity)
        .mul(iris);

      const weight = alpha.mul(transmittance);
      color.addAssign(tint.mul(weight));
      scanColor.addAssign(scanLit.mul(fog).mul(weight));
      transmittance.mulAssign(float(1).sub(alpha));
    }

    color.addAssign(background.mul(transmittance));
    color.mulAssign(mix(float(1), u.headerDim, u.dim));
    color.addAssign(scanColor);
    color.addAssign(vortexScan(u, { theta, r, iris }));
    const edge = smoothstep(0.1, 0.75, r.div(u.zoom)).mul(u.edgeDarken);
    return vec4(color.mul(float(1).sub(edge)), 1);
  })();

  return material;
}
