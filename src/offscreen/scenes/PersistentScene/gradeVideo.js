import { vec3, dot, mix, min, float } from "three/tsl";

const LUMA = vec3(0.2126, 0.7152, 0.0722);

/**
 * Video-only grade. Lifts crushed blacks, caps highlights, then pulls chroma
 * toward gray. Idle screen shaders are sampled elsewhere and skip this.
 */
export function gradeVideo(rgb, { brightness, saturation, lift, maxBrightness, amount }) {
  const gained = rgb.mul(brightness);
  const luma = dot(gained, LUMA).clamp(0, 1);
  const lifted = gained.add(lift.mul(float(1).sub(luma)));
  const liftedLuma = dot(lifted, LUMA).max(0.001);
  const capped = lifted.mul(min(float(1), maxBrightness.div(liftedLuma)));
  const graded = mix(vec3(dot(capped, LUMA)), capped, saturation);
  return mix(rgb, graded, amount);
}

/** The video as the screen displays it: graded, then boosted without changing the light it casts. */
export function displayVideo(rgb, grade) {
  const graded = gradeVideo(rgb, grade);
  const boost = value => mix(float(1), value, grade.amount);
  return mix(vec3(dot(graded, LUMA)), graded, boost(grade.displaySaturation)).max(0).mul(boost(grade.displayGain));
}
