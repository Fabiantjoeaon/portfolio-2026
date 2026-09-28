import { floor, hash, instanceIndex, mix, smoothstep, uint } from "three/tsl";

/** Stateless repeating lifecycle shared by particle-like instanced draws.
 * `u` holds lifetime / lifetimeVariation / delay / fadeIn / fadeOut uniforms.
 * `random(salt)` re-rolls every cycle, so each respawn gets fresh values.
 */
export function particleLifecycle(u, clock) {
  const seed = hash(instanceIndex.add(uint(1)));
  const lifetime = u.lifetime.max(0.1).mul(mix(1, mix(0.5, 1.5, seed), u.lifetimeVariation));
  const period = lifetime.add(u.delay.max(0));
  // Prewarm a staggered population, with a fresh spawn point each cycle.
  const elapsed = clock.add(seed.mul(period));
  const cycle = floor(elapsed.div(period));
  const age = elapsed.mod(period);
  const progress = age.div(lifetime).clamp(0, 1);
  const random = salt => hash(instanceIndex.add(uint(salt)).add(uint(cycle).mul(uint(7919))));
  const alive = age.lessThan(lifetime).toFloat();
  const envelope = smoothstep(0, u.fadeIn.max(0.001).min(lifetime.mul(0.5)), age)
    .mul(smoothstep(0, u.fadeOut.max(0.001).min(lifetime.mul(0.5)), lifetime.sub(age)))
    .mul(alive);
  return { seed, lifetime, age, progress, random, alive, envelope };
}
