const MAX_ASPECT = 16 / 9;
const DEG = Math.PI / 180;

/**
 * Mobile orientation overrides are per scene; desktop uses its authored FOV,
 * but beyond 16:9 the horizontal extent is held so ultrawide screens crop
 * vertically instead of revealing the edges of each scene.
 */
export function cameraFov(state, aspect, touch) {
  const fov = (touch ? (aspect < 1 ? state.fovPortrait : state.fovLandscape) : undefined) ?? state.fov;
  if (touch || !(aspect > MAX_ASPECT)) return fov;
  return 2 * Math.atan(Math.tan(fov * DEG / 2) * MAX_ASPECT / aspect) / DEG;
}
