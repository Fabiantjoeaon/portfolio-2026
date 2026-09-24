# Tile glass

Controls live under **PersistentScene → Glass** and use **Save to params.js**.

| Control | Effect |
| --- | --- |
| Enhanced Glass | Enables the tile-volume refraction. Off restores the existing Three Blocks transmission shader. |
| Inner Refract | Enables one internal reflection followed by another exit refraction. Off removes this path from the shader. Requires Enhanced Glass. |
| Inner Amount | Blends the internal contribution; use the switch to remove its GPU work entirely. |
| Glass IOR | Controls bending at the front and exit surfaces; 1 means no bending. |
| Glass Roughness | Controls surface reflections and mip-filtered transmission blur. |
| Backdrop Distance | Assumed distance behind the exit surface, in world units. Higher values exaggerate bevel refraction. |
| RGB Split | Chromatic separation; zero skips the extra two primary color samples. |

Enhanced Glass and Inner Refract default to on. The switches rebuild only the tile material, so the first frame after a debug toggle can compile a shader. Numeric controls update live without rebuilding. Existing screen bindings and shared uniforms survive toggles. The startup scene warm-up prepares the selected default in the rendering worker.

The shader traces the actual entry normal through an analytic box interior, respecting the GPU tile rotation and scale. It bends the outgoing ray at the exit and optionally follows one internal reflection. Fresnel weighting blends transmitted energy rather than adding glow. The rounded bevel has a planar interior approximation; this is bounded screen-space scene sampling, not full scene ray tracing. Geometry outside the viewport is unavailable, and the backdrop distance is an artistic approximation. Border fades prevent long clamped edge streaks.

Both paths reuse the existing HDR viewport snapshot and its mip chain. There are no additional render targets, back-face passes, scene copies, ray-march loops, or per-frame texture uploads. The enhanced path needs one primary lookup (three with RGB Split) and one optional internal lookup. The existing instanced mesh and physical surface lighting remain in place.

Validation: Chrome Canary / Metal WebGPU, 544 tiles, 1440×900 CSS pixels at DPR 2. Switch combinations, optical slider extremes, mobile resize, worker-rendered Meadow → About, and the digital wipe slider ranges rendered without JavaScript or GPU validation errors. Alternating frozen foreground renders measured approximately 6.69–7.02 ms for the previous shader and 6.43–7.11 ms with enhanced and internal refraction. Timing variation prevents a speedup claim; these are isolated foreground timings, not whole-site FPS.
