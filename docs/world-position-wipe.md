# Smooth world-position wipe

The old wipe projected swirl textures using sharply weighted, depth-derived normals. Surface joins and silhouettes changed those weights abruptly. Hard reveal thresholds, division by nearly zero transition padding, and a reversed smoothstep in the highlight amplified the seams into jagged white patches.

The wipe now uses smooth, single-octave 3D noise in each scene's reconstructed world space. It has no planar projection or dependency on mesh normals. An equivalent threshold formulation avoids dividing by vanishing padding, and derivative-based coverage softens the boundary at native resolution. The highlight is narrow and bounded; dual mode blends the two scenes' coverage without interpolating their world positions. Both modes have explicit endpoints, including the two phases of Black Wipe.

`Transition → Wipe → Edge Softness (px)` replaces the obsolete Triplanar Sharpness control. The other saved controls, paused preview, scene quality, DPR, MSAA, and render targets are unchanged. The two unused transition textures are no longer downloaded. The selected transition mode alone evaluates its fields; settled endpoints skip the noise work.

## Performance

Local Chrome Canary / Metal WebGPU at 1440 × 900 CSS pixels, DPR 2 (2880 × 1800 native output). Before/after shaders were alternated in the same running scenes while sweeping transition progress and interpolating the camera. Each run warmed 80 frames, then measured 30 batches of eight submitted frames with GPU completion per batch. Three's frame-node lifecycle advanced for every frame.

| Moving Ice → Cube wipe | Median | p95 batch average | Render calls / draws |
| --- | ---: | ---: | ---: |
| Original | 8.20 ms | 8.35 ms | 9.5 / 30.5 |
| Smooth 3D field | 7.41 ms | 7.51 ms | 9.5 / 30.5 |

The first alternating pair measured 8.16 → 7.41 ms. The change adds no render passes and fits the 8.33 ms rendering budget on the measured machine. These are rendering-throughput measurements, not presented FPS or a guarantee for other hardware.

## Validation

- Native-resolution captures of both modes at 0, 0.001, 0.26, 0.49, 0.51, 0.8, 0.999, and 1.
- Both modes' endpoints compared against direct scene-color selection on frozen scene buffers: zero differing channels at progress 0 and 1.
- Live mode and edge-softness controls; Ice → Cube, About entry/exit, and project entry/exit.
- Mobile resizing at DPR 2 and the normal worker renderer, with no JavaScript or GPU validation errors.
- No requests for the retired transition textures; production build and `git diff --check` passed.
