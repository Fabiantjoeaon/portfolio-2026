/** Mobile orientation overrides are per scene; desktop always uses its authored FOV. */
export function cameraFov(state, aspect, touch) {
  return (touch ? (aspect < 1 ? state.fovPortrait : state.fovLandscape) : undefined) ?? state.fov;
}
