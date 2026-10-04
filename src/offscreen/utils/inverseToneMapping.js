import { Matrix3 } from 'three/webgpu';
import { Fn, mat3, vec3 } from 'three/tsl';

// three's ACESFilmicToneMapping matrices, in the order it passes them to mat3.
const ACES_INPUT = [0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777];
const ACES_OUTPUT = [1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602];
const inverse = values => mat3(...new Matrix3().set(...values).invert().transpose().elements);
const INPUT_INVERSE = inverse(ACES_INPUT);
const OUTPUT_INVERSE = inverse(ACES_OUTPUT);

/**
 * The linear color that ACESFilmicToneMapping (exposure 1) maps to `color`, so
 * flat media survives the frame's tone mapping as authored. The fit tops out
 * just below 1, so whites land at ~0.99. Saturated colors come back slightly
 * negative, since ACES desaturates them; they only survive written through a
 * material's outputNode into a float target.
 */
export const inverseACESFilmic = Fn(([color]) => {
  const fitted = OUTPUT_INVERSE.mul(vec3(color).clamp(0, 1)).clamp(0, 0.99);
  const a = fitted.mul(0.983729).sub(1);
  const b = fitted.mul(0.4329510 * 0.983729).sub(0.0245786);
  const c = fitted.mul(0.238081).add(0.000090537);
  const v = b.negate().sub(b.mul(b).sub(a.mul(c).mul(4)).sqrt()).div(a.mul(2));
  return INPUT_INVERSE.mul(v).mul(0.6);
});
