# Scene transition preparation and motion

Startup now waits for the About portrait, Three Blocks batched text, actual scene pipelines, and scene/page composite variants. Preparation runs in the existing OffscreenCanvas worker by default, yields between passes, and drains GPU work before releasing the loader. Debug/recording can still use the main-thread renderer. Loading takes longer; navigation reuses the prepared resources.

The compositor retains complete materials, including their live uniform nodes, instead of rebuilding TSL graphs on every scene switch. The normal three-scene configuration prepares 31 variants, including About's hidden persistent layer and combined output pass. Texture identities survive resize. Structural fog changes invalidate the cache; ordinary uniform edits remain live.

Three Blocks' single-draw MSDF batches and shared transmission viewport snapshot are warmed through their actual render paths. Their quality settings, along with scene resolution, MSAA, reflections, fog samples, and particle counts, are preserved. Portrait particles whose reveal or facing factor is exactly zero collapse their quads before rasterization; previously their transparent, enlarged halos still consumed fragment work.

Project videos buffer during loading, with only the active video playing and transferring frames. Worker notifications use cloned data rather than allocating per-event Comlink proxies, and incoming pointer/resize/navigation events are no longer echoed back.

GSAP CustomEase curves 1, 3, and 4 drive screen fades, synchronized camera/wipe movement, tile motion, overlay return, and About text reveal. All five supplied curves are exported from `src/offscreen/lib/customEases.js`. Curves are sampled by the existing render clock. Opacity and scene mixing use bounded curves, with no overshoot.

## Measurements

Chrome Canary, Apple Metal WebGPU, 1440 × 900 CSS pixels at DPR 2 (2880 × 1800 canvas). Same local machine and frame-driving harness before/after, main-thread debug renderer, GPU timestamp readbacks disabled. Each sample submits a complete frame and waits for GPU completion; these are frame-work timings, not presented FPS. Each path includes 180 frames at a simulated 60 Hz, covering the 2-second transition and its settled endpoint.

| Path | First frame before → after | p95 before → after |
| --- | ---: | ---: |
| Ice → About | 651.3 → 10.4 ms | 30.0 → 21.8 ms |
| Ice → Project | 360.7 → 18.6 ms | 11.0 → 10.9 ms |
| About → Ice | 476.5 → 10.6 ms | 14.2 → 15.4 ms |
| Project → Ice | 460.9 → 10.1 ms | 9.3 → 10.4 ms |
| Cube → About | 33.1 → 6.8 ms | 26.2 → 17.9 ms |
| Meadow → About | 29.9 → 33.9 ms | 27.3 → 21.7 ms |

A repeat with the debug camera restored to its initial scene produced the table above; individual first frames remain noisy (including Meadow → About).

The production-style worker check covered all 12 main-scene/page entry and exit paths: zero cold compositor variants, no frames above 33.3 ms, and no JavaScript/GPU validation errors in that run. About entry p95 ranged from 15.9 to 19.0 ms; first frames ranged from 6.9 to 9.3 ms. This removes the large compilation stalls but does not establish a universal 60/120 FPS guarantee, particularly while two heavy scenes overlap on other hardware.

## Reproduce

Open `/?manual&debug`, wait for the loader, and run:

```js
await (await import('/scripts/benchmark-transitions.js')).benchmarkTransitions()
```

The helper checks prepared-material reuse, transition endpoints, persistent-layer restoration, and compositor ownership while measuring each path. It restores the real render clock and renderer settings afterward. The same helper runs in the render worker's DevTools execution context on `/?manual`. Like the existing scene benchmark, it uses Three r186's internal frame lifecycle solely for measurement; recheck it when upgrading Three.

Additional checks: actual worker navigation and video transfer, desktop → mobile resize retaining all 31 variants, DPR 2 canvas dimensions, production build, direct About/Project routes at DPR 1, and Back navigation.
