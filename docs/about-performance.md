# About rendering budget

Target: 120 FPS, or 8.33 ms/frame. The regression came from two 25-tap glyph filters executed per fragment, including unselected letters, on quads enlarged to 6.25 times their original area.

## Changes

- Keep three-blocks `BatchedMSDFText`: 17,700 glyphs remain in one draw. Build a padded, four-channel blur atlas once from the font's coverage. Crisp text, defocus, and glow now need two texture samples total; only selected glyphs receive padding. Per-glyph pulse and shimmer work runs in the vertex stage. Layout changes refresh the additional atlas coordinates through the batch's existing repack lifecycle.
- Skip persistent screen, lighting, and glass transmission work after the About fade-out completes. Restore it immediately on exit.
- Use the text/particle shaders' own antialiasing for the About target, avoiding its additional MSAA resolve. Other scene targets retain their existing sample count.
- At DPR above 1, render the soft portrait into a CSS-resolution target and add it in the existing scene composite. Text stays at native device resolution. At DPR 1 the portrait remains in the main scene.
- Fold output tone mapping/color conversion into the final About composite while the page is settled; the normal output path remains available during transitions. Clear scene targets in their render pass.

## Measurement

Local Chrome Canary, Apple Metal WebGPU, 1440 × 900 CSS pixels, DPR 2 (2880 × 1800 output), default saved parameters, glow/pulses enabled. Warmed measurements submit eight frames per batch and wait for GPU completion once per batch. These measure sustained rendering throughput, not the display's refresh rate. Per-frame timestamp readbacks were excluded because they add synchronization overhead.

| Configuration | Median frame time | 95th percentile | Render calls / draws |
| --- | ---: | ---: | ---: |
| Original regression, including hidden persistent passes | 32.88 ms | 34.98 ms | 8 / 12 |
| Optimized About | 6.02 ms | 6.88 ms | 3 / 4 |
| Optimized About, repeat | 5.87 ms | 6.78 ms | 3 / 4 |

These results meet the 8.33 ms budget on the measured machine. Performance on other GPUs and viewport sizes must be measured separately.

To check the current machine, open `/about?debug` in the dev server, wait for the transition, and run this in DevTools:

```js
await (await import('/scripts/benchmark-about.js')).benchmarkAbout()
```

The benchmark restores the animation loop and timestamp settings when it finishes. `within120FpsBudget` compares the 95th percentile of batch-average frame times with 8.33 ms.

Validation also covered the production build, desktop/mobile views, the Retina worker path, two texture samples in the compiled glyph fragment shader, live control saving, text-layout repacking, pulse output, and navigation both into and out of About with the other scenes' MSAA settings preserved.
