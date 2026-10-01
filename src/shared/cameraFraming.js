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

/** Resolve a touch-only pitch without mutating the authored pose. */
export function cameraLookAt(state, touch, target = {}) {
  const look = state.lookAt;
  target.x = look.x; target.y = look.y; target.z = look.z;
  const pitch = touch ? state.mobilePitchDown ?? 0 : 0;
  if (!pitch) return target;
  const positionZ = state.position.z + (touch ? state.mobileZOffset ?? 0 : 0);
  const dx = look.x - state.position.x, dy = look.y - state.position.y, dz = look.z - positionZ;
  const horizontal = Math.hypot(dx, dz);
  if (!horizontal) return target;
  const distance = Math.hypot(horizontal, dy);
  const angle = Math.atan2(dy, horizontal) - pitch * DEG;
  const scale = Math.cos(angle) * distance / horizontal;
  target.x = state.position.x + dx * scale;
  target.y = state.position.y + Math.sin(angle) * distance;
  target.z = positionZ + dz * scale;
  return target;
}

export function cameraPosition(state, touch, target = {}) {
  target.x = state.position.x;
  target.y = state.position.y;
  target.z = state.position.z + (touch ? state.mobileZOffset ?? 0 : 0);
  return target;
}
