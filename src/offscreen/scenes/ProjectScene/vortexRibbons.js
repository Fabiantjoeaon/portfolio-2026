import {
  cameraPosition, cos, exp, float, mix, normalize, sin, smoothstep, uniform, vec2, vec3,
} from "three/tsl";
import { TUBES, cloudCoord, cloudDensity, vortexIris } from "./vortexSky.js";

// Far enough that camera sway adds no parallax against the sky sphere
const DISTANCE = 200;

/** ParticleRibbons path + appearance for the cloud vortex. Each ribbon rides a
 * front tube along a line of constant cloud angle — the direction the clouds
 * are stretched — and is advected by the same travel / spin as the sky, so it
 * stays glued to one streak while it spirals out of the core. Opacity follows
 * the cloud rims sampled from the sky's own density field.
 */
export function createVortexRibbons(u, { length, near, far, slide, wobble, follow }) {
  const controls = {
    length: uniform(length),
    near: uniform(near),
    far: uniform(far),
    slide: uniform(slide),
    wobble: uniform(wobble),
    follow: uniform(follow),
  };
  const [front, back] = TUBES;

  const ribbon = ({ t, life }) => {
    const onFront = life.random(5).lessThan(0.6).toFloat();
    const radius = mix(back.radius, front.radius, onFront);
    const span = controls.length.mul(mix(0.6, 1.4, life.random(31)));
    const depth = mix(controls.near, controls.far, life.random(23))
      .add(t.mul(span))
      .sub(life.age.mul(u.flowSpeed.add(controls.slide)))
      .sub(u.pageScroll.mul(u.scrollDepth))
      .max(0.35);
    const angle = life.random(11).mul(Math.PI * 2)
      .add(sin(depth.mul(1.7).add(life.random(43).mul(Math.PI * 2))).mul(controls.wobble));
    return {
      radius,
      depth,
      angle,
      seed: mix(back.seed, front.seed, onFront),
      theta: angle.sub(depth.mul(u.twist)).sub(u.spin.mul(mix(back.spin, front.spin, onFront))),
      r: radius.div(depth),
    };
  };

  const path = inputs => {
    const { theta, r } = ribbon(inputs);
    const planar = vec2(cos(theta), sin(theta)).mul(r).add(vec2(u.centerX, u.centerY));
    const dir = normalize(u.axisRight.mul(planar.x).add(u.axisUp.mul(planar.y)).add(u.axisForward));
    return cameraPosition.add(dir.mul(DISTANCE));
  };

  const appearance = inputs => {
    const { t, life, uniforms } = inputs;
    const { radius, depth, angle, seed, r } = ribbon(inputs);
    const density = cloudDensity(cloudCoord(u, { angle, depth, radius, seed }));
    const rim = smoothstep(u.coverage.sub(0.12), u.coverage.add(0.04), density)
      .mul(float(1).sub(smoothstep(u.coverage.add(0.1), u.coverage.add(0.4), density)));

    // Drawn out of the depth over the first part of its life, then the far end
    // retracts until the tip flies out towards the viewer
    const head = float(1).sub(smoothstep(0, 0.4, life.progress));
    const tail = float(1).sub(smoothstep(0.6, 1, life.progress));
    const stroke = smoothstep(head, head.add(0.15), t)
      .mul(float(1).sub(smoothstep(tail.sub(0.15), tail, t)));

    const fog = exp(depth.mul(u.fogDensity).negate());
    const edge = float(1).sub(smoothstep(0.1, 0.75, r).mul(u.edgeDarken).mul(0.5));
    return {
      color: mix(vec3(u.glowColor), uniforms.color, fog),
      opacity: stroke
        .mul(mix(float(1), rim, controls.follow))
        .mul(fog)
        .mul(smoothstep(0.03, 0.14, r))
        .mul(edge)
        .mul(vortexIris(u, r))
        .mul(u.reveal)
        .mul(mix(float(1), u.headerDim, u.dim)),
      width: mix(0.35, 1, stroke).mul(mix(0.5, 1.6, smoothstep(0.05, 0.6, r))),
    };
  };

  return { path, appearance, controls };
}
