# Ice, Cube, and shared rendering performance

Quality constraints: preserve DPR, render-target sizes and formats, MSAA, geometry, reflection cadence, fog samples, texture filtering, lighting, and saved parameters.

## Changes

- Render the fullscreen composite as the opaque background of the persistent scene. The existing three-blocks `MeshTransmissionNodeMaterial` snapshots it before drawing the glass. This shares the HDR framebuffer, removes the separate depth clear, and applies the output transform once instead of twice. The fullscreen triangle writes no depth and is detached before any reflection render.
- Reject the non-emitting side of each screen light before its texture lookups and polygon integration. Evaluate the identity diffuse LTC transform directly in world space; retain the specular transform and both front/back emitters.
- Skip Cube's two glow-noise octaves on cap faces, where the spill multiplier is exactly zero. Keep its existing instanced geometry and GPU animation.
- Skip scene shading/fog where a closer, fully opaque screen pixel replaces it. Partial opacity and scene transitions retain the original blend and fog samples.
- Clear Ice's reflection in its first scene render instead of clearing it twice.

No resolution, DPR, sample-count, geometry-detail, or effect-setting reductions are part of these changes.

## Measurement

Chrome Canary, Apple Metal WebGPU, 1440 × 900 CSS pixels at DPR 2; native output 2880 × 1800. Ice and Cube targets retain 4× MSAA. Ice's existing reflection remains 1440 × 900 with 4× MSAA and its existing update cadence.

The original and optimized builds were compared in alternating runs in the same browser, with each inactive page's render loop stopped. Each run warmed 80 frames, then measured 30 batches of eight frames, waiting for GPU completion after each batch. Three's FRAME-node lifecycle advanced on **every** submitted frame, including animated textures and Gaussian light filtering. GPU timestamp collection was disabled during measurement.

| Scene | Before median / p95 | After median / p95 | Median improvement | Render calls before → after |
| --- | ---: | ---: | ---: | ---: |
| Cube | 5.72 / 6.19 ms | 3.91 / 4.00 ms | 32% | 10 → 7 |
| Ice | 8.73 / 8.86 ms | 7.52 / 7.98 ms | 14% | 11.5 → 8.5 |

These are the second alternating pair. The first pair measured Cube 5.72 → 4.04 ms and Ice 8.72 → 7.59 ms. Fractional call counts average Ice's alternating reflection frames. Renderer call counts are not a count of all backend operations, such as mip generation.

Both optimized p95 batch averages fit the 8.33 ms budget for 120 FPS on this machine. This measures sustained rendering throughput, not presented FPS; the headless display runs at 60 Hz. Different hardware, viewport sizes, camera views, and transitions require their own measurements.

## Reproduce

Open `/?scene=ice&manual&debug` or `/?scene=cube&manual&debug`, wait for loading, then run:

```js
await (await import('/scripts/benchmark-scenes.js')).benchmarkScene()
```

The result includes native canvas size, DPR, MSAA, median, p95, and average render/draw counts. The helper restores animation and timestamp settings, including on errors. It uses Three r186's internal animation/frame lifecycle solely for measurement; recheck those hooks after upgrading Three. The About benchmark now uses the same lifecycle-correct helper.

## Validation

- Deterministic, matching-time native-resolution canvas comparisons: over 99.999% of RGB channels identical in both scenes; all remaining differences were at most 1/255. No pixel channel differed by more than one quantization level.
- Ice → Cube → Ice and About entry/exit, including the mixed-MSAA transition and hidden persistent scene.
- Mobile resize at DPR 2: 780 × 1688 canvas, 390 × 844 existing Ice reflection; return to desktop.
- Partial screen opacity, off-axis camera, 48-step fog control, and benchmark animation restoration.
- Both scenes' normal worker path at DPR 2; no JavaScript or GPU validation errors.
- Production build and `git diff --check`.
