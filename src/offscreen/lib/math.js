export function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));
}

export function map(
  value,
  oldMin = -1,
  oldMax = 1,
  newMin = 0,
  newMax = 1,
  isClamp
) {
  const newValue =
    ((value - oldMin) * (newMax - newMin)) / (oldMax - oldMin) + newMin;
  if (isClamp) {
    return clamp(newValue, Math.min(newMin, newMax), Math.max(newMin, newMax));
  }

  return newValue;
}

export function _lerp(source, target, alpha) {
  return source + (target - source) * clamp(alpha, 0, 1);
}

export function lerp(source, target, rate, frameDelta, targetFps = 60) {
  // return normal lerp if no delta was passed
  if (typeof frameDelta === "undefined") {
    return _lerp(source, target, rate);
  }

  const relativeDelta = frameDelta / (1 / targetFps);
  const smoothing = 1 - rate;
  return _lerp(source, target, 1 - Math.pow(smoothing, relativeDelta));
}

export function damp(x, y, t, delta) {
  return lerp(x, y, 1 - Math.exp(Math.log(1 - t) * (16.6666 / delta)));
}

export function dampSingle(x, y, t, d) {
  return lerp(x, y, 1 - Math.exp(Math.log(1 - t) * d));
}

export function parabola(x, k) {
  return Math.pow(4.0 * x * (1.0 - x), k);
}

export function randomInRange(min, max, precision = 0) {
  if (typeof min === "undefined") return Math.random();
  if (min === max) return min;

  min = min || 0;
  max = max || 1;

  if (precision == 0) return Math.floor(Math.random() * (max + 1 - min) + min);
  return Math.round(min + Math.random() * (max - min), precision);
}

export function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians) {
  return (radians * 180) / Math.PI;
}
