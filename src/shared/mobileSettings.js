// Touch-only overrides. Desktop scene parameters remain independent.
export const mobileSettings = {
  hoverStrength: 4,
  meadowRain: { rainIntensity: 1, rainCellSize: 1.5, rainOpacity: 0.18 },
  interfaceSweep: { whooshAlpha: 0.8 },
  cubeCameraPitchDown: 2,
  iceCameraPitchDown: 3,
  aboutCameraPitchDown: 0,
  projectCameraPitchDown: 0,
  cubeCameraZOffset: 0,
  meadowCameraZOffset: 1,
  iceCameraZOffset: 1,
  aboutCameraZOffset: 0,
  projectCameraZOffset: 0,
  meadowCameraPitchDown: 2, // Degrees below the authored camera direction.
  projectRibbonCount: 224,
  aboutVignetteVerticalScale: 0.25,
  aboutVignette: { vignetteStrength: 0.11, vignetteRadius: 0.13, vignetteSmoothness: 0.79 },
  aboutWall: {
    wallFocusCoverage: 0.22,
    wallDefocus: 1.1,
    wallGlow: 1.6,
    wallGlowRadius: 2,
    wallPulseStrength: 2,
    wallPulseInterval: 7,
    wallFontSize: 0.46,
    wallLetterSpacing: 0.11,
    wallWeight: -0.08,
    wallSpeed: 0.42,
    wallSwayAmount: 0.31,
    wallSwaySpeed: 0.1,
    wallShimmerAmount: 0.73,
    wallShimmerLift: 0.17,
    wallShimmerScale: 0.93,
    wallShimmerSpeed: 0.5,
    wallShimmerLetterPhase: 1.75,
    wallColor: 0x7999c3,
    wallDepthFade: 0.85,
    wallOpacity: 0.57,
    wallLayerOpacity: 0.59,
    wallDepthOpacityFade: 0.99,
  },
  // Ice sways (6, 2) on desktop; hoverStrength would blow that up on a phone.
  iceHoverPos: [2, 2, 0],
  portraitColumns: 11,
  portraitRows: 14,
  landscapeColumns: 16,
  landscapeRows: 9,
  gridWidth: 0.72,
  gridHeight: 0.5,
  tileGap: 0.1, // Fraction of each cell left open between tiles.
  // World units the ground sits below its desktop height (Cube, Meadow, Ice).
  floorDrop: 6,
  roseScale: 1.5, // Multiplier on the authored meadow rose size range.
  iceFloorDrop: 2, // Additional drop for ice only.
  // About avatar. These mirror the desktop Portrait controls and apply only
  // while the touch experience is on, so desktop sliders stay independent.
  // Narrow touch reads portraitX / portraitY; wide touch keeps the landscape
  // framing below.
  portrait: {
    portraitEnabled: true,
    portraitX: 0,
    portraitY: 0.185,
    portraitScale: 1,
    portraitDepth: 0.45,
    portraitRotationX: 11,
    portraitRotationY: 15,
    portraitRotationZ: 0,
    portraitPointSize: 0.9,
    portraitDensity: 0.9,
    portraitResponsiveDensity: false,
    portraitOpacity: 0.78,
    portraitSoftness: 0.01,
    portraitDither: 0.15,
    portraitDitherScale: 3.5,
    portraitNeckFade: 0.2,
    portraitEdgeFade: 0,
    portraitColor: 0xbfbfbf,
    portraitShadowColor: 0xb0b0b0,
    portraitExposure: 4.15,
    portraitGamma: 1.52,
    portraitAmbient: 1.69,
    portraitLightStrength: 1.95,
    portraitLightDirection: [2, 2, 0.15],
    portraitRim: 0.66,
    portraitMouseLight: 0.95,
    portraitHoverStrength: 1.25,
    portraitHoverRadius: 0.22,
    portraitFocus: 0.58,
    portraitFocusWidth: 0.77,
    portraitDepthBlur: 0.55,
    portraitDefocusColor: 0x47a9e6,
    portraitGlow: 0.6,
    portraitGlowRadius: 5.4,
    portraitGlitchAmount: 0.11,
    portraitGlitchFrequency: 0.1,
    portraitGlitchSpeed: 6,
    portraitRevealScatter: 1,
    portraitMotionAmount: 0.0015,
    portraitMotionSpeed: 0.45,
    portraitMouseTilt: 12,
  },
  portraitFitHeight: 0.43,
  portraitFitWidth: 0.84,
  portraitLandscapeFitHeight: 0.8,
  portraitLandscapeFitWidth: 0.44,
  portraitLandscapeOffsetX: -0.21,
  portraitLandscapeOffsetY: 0,
  galleryBars: 6,
  galleryStagger: 0.03,
  glyphSizeScale: 1.2,
  // Overrides the tier count (phones land on the low tier, 80).
  glyphCount: 180,
  tileHoverScale: 1.25,
  // Desktop flakes fill a volume wider than a phone. A tighter box and a higher
  // count put more of them in the mobile frame without raising the instance cap.
  flakeCount: 1800,
  flakeBounds: [48, 36, 88],
};

export function snapshotMobileSettings(settings = mobileSettings) {
  const out = {};
  for (const [key, value] of Object.entries(settings)) {
    if (Array.isArray(value)) out[key] = value.slice();
    else if (value?.isVector2 || value?.isVector3 || value?.isVector4) {
      const axes = value.isVector2 ? ["x", "y"] : value.isVector4 ? ["x", "y", "z", "w"] : ["x", "y", "z"];
      out[key] = axes.map((axis) => value[axis]);
    } else if (value?.isColor) out[key] = value.getHex();
    else if (value && typeof value === "object") out[key] = snapshotMobileSettings(value);
    else out[key] = value;
  }
  return out;
}

// Getters keep live mobile edits in the shared transition camera path.
export function bindMobileCamera(state, scene) {
  Object.defineProperties(state, {
    mobilePitchDown: { configurable: true, get: () => mobileSettings[`${scene}CameraPitchDown`] ?? 0 },
    mobileZOffset: { configurable: true, get: () => mobileSettings[`${scene}CameraZOffset`] ?? 0 },
  });
  return state;
}
