// Touch-only overrides. Desktop scene parameters remain independent.
export const mobileSettings = {
  hoverStrength: 4,
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
  iceFloorDrop: 2, // Additional drop for ice only.
  portraitDensity: 0.3,
  portraitDither: 0.15,
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
