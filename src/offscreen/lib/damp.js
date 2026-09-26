import { float, pow } from "three/tsl";

/**
 * Frame-rate independent lerp factor: `amount` is the per-frame alpha at 60 fps.
 * @param {number} amount
 * @param {number} delta - Seconds
 */
export const dampFactor = (amount, delta) =>
  1 - Math.pow(1 - amount, Math.max(0, delta) * 60);

/** TSL twin of {@link dampFactor}; both arguments are nodes. */
export const dampFactorNode = (amount, delta) =>
  float(1.0).sub(pow(float(1.0).sub(amount), delta.mul(60.0)));
