# Textured world-position wipe

The old wipe projected swirl textures using sharply weighted, depth-derived normals. Surface joins and silhouettes changed those weights abruptly. Hard reveal thresholds, division by nearly zero transition padding, and a reversed smoothstep in the highlight amplified the seams into jagged white patches.

The wipe blends smooth, single-octave 3D noise with a continuous volume derived from the original swirl artwork. The image is converted once into a 64³ R8 texture (256 KiB), shared by all transitions. Smooth periodic coordinates carry the image through the volume's depth and stay inside its borders, so even non-tileable images avoid wrap seams. Hardware interpolation filters all three axes. No surface normals or face-dependent projection weights are involved.

Each scene is evaluated in its own reconstructed world space. The existing stable threshold, derivative-based edge coverage, bounded highlight, and exact endpoints remain in place. Dual mode blends coverage without interpolating world positions. Neither renderer DPR, scene quality, MSAA, nor render targets change.

## Controls

Under **Transition → Wipe → Texture**:

| Control | Effect |
| --- | --- |
| Texture Blend | 0 preserves the previous smooth look exactly; 1 uses only the artwork; the default 0.45 combines them. |
| Scale | Changes the size of the texture's features, independently of the existing noise/grid scales. |
| Stretch | Elongates the features along the rotated field axis. |
| Angle | Turns the texture's direction independently of the wipe's box rotation. |
| Variation | Moves through different parts of the volume without changing the wipe origin. |
| Preview Image… | Replaces the source with a local image and rebuilds the volume once. The old GPU texture is disposed. |

Numeric controls use the existing **Save to params.js** workflow. Image selection is a session preview; to ship different artwork, replace `public/assets/textures/transition/transition-pattern.png` and update its resource byte count. The shipped 256² PNG is a filtered derivative of `transition-swirl.png`, totaling 104,342 bytes. The original large swirl/radial files are not downloaded.

**Edge Softness (px)** still controls the reveal boundary. Increasing texture blend adds the artwork's flowing contours without reintroducing triplanar joins. The conversion is a volumetric interpretation of the image, rather than a literal image projected onto each surface.

## Performance

There are no added render passes or per-frame texture generation. Intermediate blend values evaluate both sources, with one volume lookup per field sample. Blend 0 skips texture sampling; blend 1 skips procedural noise. Settled transition endpoints skip both.

Local Chrome Canary / Metal WebGPU, 1440 × 900 CSS pixels at DPR 2 (2880 × 1800 native output). Final compositor comparisons alternate the previous smooth shader, the new blend, and texture-only mode on frozen scene buffers. Each run warms 80 frames, then measures 30 batches of eight submitted frames, fencing GPU completion after each batch and advancing Three's frame-node lifecycle.

| Compositor, repeated runs | Median range | Render calls / draws |
| --- | ---: | ---: |
| Previous smooth field | 4.34–4.40 ms | 2 / 2 |
| Default texture blend | 4.58–4.63 ms | 2 / 2 |
| Texture only | 3.69–3.82 ms | 2 / 2 |

Full-scene timing was variable: an initial comparison measured 7.43 → 7.52 ms, while later runs measured roughly 11–15 ms for both versions with other desktop GPU processes active. Complete-scene render/draw counts remained 9.5 / 30.5 on average. The final full-scene samples do not establish a stable 120 FPS baseline. These are GPU-fenced rendering-throughput measurements, not presented FPS.

## Validation

- Native-resolution captures of both modes at 0, 0.001, 0.26, 0.49, 0.51, 0.8, 0.999, and 1; texture blend at 0, 0.45, and 1.
- Both modes' endpoints compared against direct scene-color selection on frozen scene buffers: zero differing channels at progress 0 and 1.
- Blend 0 compared against the previous smooth shader on frozen scene buffers: zero differing channels.
- Texture slider extremes, numeric save serialization, and live image replacement exercised. Flat black and white uploads produced different coverage, and the source artwork was restored afterward.
- Live mode and edge-softness controls; Ice → Cube, About entry/exit, and project entry/exit.
- Mobile resizing at DPR 2 and the normal worker renderer, with no JavaScript or GPU validation errors.
- Main-thread and worker image orientations produce identical volume bytes.
- Only the compact transition image is requested; production build and `git diff --check` passed.
