# Touch experience

Phones, tablets, and devices whose primary pointer is coarse and cannot hover
use the touch experience. Main-thread detection forwards `touchExperience` to
both render paths; it does not depend on worker access to `matchMedia`.

The home grid has 108 cells in portrait and 98 in landscape, down from 544.
All 12 current projects retain distinct tiles: normalized positions are mapped
onto the smaller grid with deterministic collision resolution. Layout expands
if the collection ever needs more cells. The SDF grid interface remains;
project callouts and the MSDF instruction label are omitted on touch.

Drag the bracket/plus cursor, or drag anywhere on the canvas, to move a
persistent virtual hover. Tapping the canvas positions it; tapping the cursor
opens the selected project (or interacts with the scene outside the grid).
Releasing a drag never opens a project. The bottom-left DOM instruction shows
the selected name and tap action. The cursor supports arrow keys and Enter,
56px touch targets, reduced motion, pointer cancellation, and safe-area spacing.
It animates in/out and disappears on Project/About pages, where native scrolling
and gallery swiping keep their existing handlers. Home's availability label is
hidden on touch to leave room for the instructions.

Each scene has independent mobile portrait/landscape FOVs (initially 54°/46°)
and uses full desktop hover sway; the smaller grid stays
clear of navigation and the lower instruction area. Camera positions stay
inside the rooms. Layout and cursor bounds refresh on orientation changes.

## Cube compatibility

The WebGL fallback reproduced `transformFeedbackVaryings: too many varyings`
and vertex-buffer overruns. Cube tree metadata now comes from static float
textures, and highlight/flow history shares an instanced vec2 buffer. The
compute pass has four output buffers, with the correct instance divisor.
Cube and grid compute dispatches use the actual instance count rather than a
padded draw count. Both WebGPU and WebGL retain the animated walls and relief.

Validation: Chromium WebGPU touch gestures and all project selections;
Chromium WebGL fallback; WebKit 18.2 mobile/desktop cube rendering; portrait and
landscape layout; Project/About hiding and return; meadow and ice mobile framing.
Physical iOS hardware remains a separate device check.

Run `node scripts/test-touch-layout.mjs` and
`node scripts/test-gallery-motion.mjs` for the layout and gallery regressions.

Possible next improvements: a compact project-list alternative; pause automatic
scene cycling while dragging; a thumb-accessible sound toggle.

Touch-only grid density/coverage, floor clearance, hover strength, and
portrait density/dithering are defined in `src/shared/mobileSettings.js` and
can be adjusted live in the Inspector’s **Mobile only** group. Floors are two
world units lower. Each scene’s Camera folder contains Desktop FOV, Mobile
Portrait FOV, and Mobile Landscape FOV. Meadow’s Wall folder also contains
Mobile Z/Width/Height controls. Mobile floor offsets are derived at runtime and
never saved into desktop floor settings. Phone project media uses 3:4 portrait frames with cover cropping.

The loader uses a mono counter, a touch-device desktop-viewing note, and explicit
entry choices with/without sound. Tone is prepared before entry so AudioContext
resume happens inside the trusted tap on Safari. Silent entry keeps master gain
at zero. About wall matrices upload through a float texture to avoid stale
WebGL PBO transforms stacking words in one column.
