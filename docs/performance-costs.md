# Most expensive rendering costs

The ten costs with the largest performance impact, ordered by their effect on the phones that crash first, then on desktop. Every item was checked against the code; each one lists what is already in place, so the options below it are only those that aren't.

Measured costs: Ice, Cube, About and transitions (see `scenes-performance.md`, `about-performance.md` and `transition-performance.md`), and GPU memory on a 393×735 @3 project page. Everything else is estimated from the code and settings.

## Costs

1. **Full-screen render buffers (memory; worst on iPhone).** A project page holds about 161 MB of render targets, out of about 212 MB of GPU memory in total:
   - **Four 786×1470 HDR targets:** the scene output, the persistent screen target, the active scene's gbuffer, and About's own gbuffer. About's stays allocated on every page.
   - **Five depth buffers:** those four, plus the second pooled gbuffer slot.
   - **Smaller targets from scenes that aren't on screen:** the glass backdrop copy (589×1102 with mips), the Cube shaft atlas (768×512 with mips), and the rose animation texture (3482×340).
   - **Gallery posters:** 960×960 with mips each, all loaded at once.

   The buffers are 786×1470 rather than 590×1103 because of item 6.

2. **Scene transitions.** For about 2 seconds, both scenes update and render in full every frame. These are the slowest frames measured on the dev Mac: 95th-percentile frame time is about 22 ms for Ice → About and Meadow → About.

3. **Video playback.**
   - **Home thumbnails:** all 12 load one by one after startup and stay loaded. Pausing keeps their source, so their decoder buffers remain.
   - **Project slots:** 3 more video elements are primed for project pages.
   - **Streaming:** a playing film streams 30 frames per second into WebGPU.

   The same video texture also drives the room's screen light. In Safari, `FrameImporter` removes the CPU copy from the stream.

4. **Ice scene.** It was measured at 7.5 ms per frame at 2880×1800. That measurement's reflection settings are out of date, so it needs re-measuring. The scene includes:
   - the ground reflection, which re-renders the scene (snowfall included) at half resolution every 2nd frame;
   - fog ray marching with 8 steps;
   - 1,023 snowflakes on desktop and 1,800 on phones.

5. **Meadow scene.** It has a benchmark (`scripts/benchmark-meadow.js`), but no recorded result. The scene includes:
   - the water reflection at half resolution every 2nd frame, including rain, roses and the plant wall;
   - 3,072 rain instances;
   - up to 64 roses;
   - 11 tracking walls;
   - fog with 8 steps.

6. **Pixel density.** The base DPR is 1.5 on phones (low tier) and 2 on high. Two settings change it:
   - **Project pages:** once a project page settles, it switches to the native DPR, capped at 2, so phones render project pages at 2. That's about 1.8× the pixels and buffer memory of 1.5.
   - **Adaptive resolution:** it lowers DPR under load, but never below 1.5, so phones can't drop at all.

7. **Glass grid tiles.** On home, the backdrop is copied at full resolution with mips every frame. Chromatic aberration (three backdrop samples instead of one) and inner refraction are on for every tier.

8. **Light shafts.**
   - **Screen shafts:** 20 steps at quarter resolution; 12 steps on medium, off on low.
   - **Cube shafts:** 19 steps at 0.45 resolution, plus a mip-mapped atlas.

   Both use jitter without temporal smoothing.

9. **Screen light rendering.** The room's screen light runs whenever the persistent layer isn't fully hidden, including on project pages where the screen light is faded out. Its other costs are already low:
   - the light source is a blurred 256×128 copy of the screen;
   - the area-light math skips surfaces facing away from the screen;
   - the lit wipe only shades a thin band at its edge, and is off on low.

10. **About page.** It runs at about 6 ms, with:
    - about 17,700 glyphs in one draw, none of them culled when off screen;
    - about 85,000 portrait particles on desktop and 90,000 on phones.

There's also a one-off cost: the startup loader compiles 31 shader variants, which makes loading longer but stops first-frame stalls.

## Where to look first

- **iOS crashes:** item 6 (project pages switching phones to DPR 2), then items 1 and 3.
- **Frame rate:** items 2, 4, 5 and 7.

## Options

Each option is tagged by its visual cost:

- **[none]** looks identical.
- **[subtle]** hard to spot, especially in motion.
- **[visible]** a noticeable trade-off.

Options can be limited to low/medium devices through `src/shared/tiers.js`, which leaves desktop untouched. These are candidates, not measured wins: benchmark each before keeping it.

### Everywhere

Already in place: a 60 fps cap (`src/shared/frameLimit.js`), adaptive resolution (`src/offscreen/utils/AdaptiveResolution.js`), quality tiers, and shader pre-compilation during loading.

- **[none] Stop the render loop while the tab is hidden.** `raf.pause()` exists but nothing calls it; only audio reacts to `document.hidden`.
- **[none] Render only when something changes.** A settled project page with no film playing and no scroll could skip frames; today every accepted frame renders.
- **[subtle] Run settled pages at 30 fps.** The component helper already supports `raf: { fps }`, but `Site` uses `Infinity`.
- **[subtle] Let adaptive resolution go below 1.5 on phones** (for example down to 1.0). Its floor is `min(1.5, base DPR)`, which pins phones at 1.5.
- **[subtle] Lower DPR during transitions, swipes and fast scrolls,** and restore it when things settle.
- **[visible on low/medium] Fill in the commented-out `tiers.js` rows:** glass, Meadow reflections and tracking walls, Cube particles and shafts, the Ice reflection, and fog.
- **[none] Add per-pass GPU timing in `?debug`.** Today GPU timestamps are only used by the tier benchmark; the scene benchmarks turn them off.

### 1. Full-screen render buffers

Already in place:
- scenes share a gbuffer pool of 2;
- shaft, fog and screen-light passes have no depth buffer;
- gallery textures are released when leaving a page;
- the screen light source is a fixed 256×128.

Options:
- **[none] Release About's gbuffer when About isn't shown,** and re-create it during the transition in. The same goes for other off-screen scenes' targets: the Cube shaft atlas, the reflection targets, and the rose animation texture.
- **[none] Share one depth buffer** between same-size passes that run one after another.
- **[none] Load gallery media for the active slide and its neighbours only.** Today every image and poster is fetched and kept.
- **[subtle] Store HDR buffers as `rg11b10ufloat`** where no alpha is needed. It halves their memory; it needs the `rg11b10ufloat-renderable` feature, with a fallback where that's missing.
- **[subtle] Compress gallery images to KTX2,** about 4× smaller in GPU memory, or ship 720 px posters on phones.
- **[subtle] Skip gallery mipmaps** where slides are never drawn much smaller than their size.

### 2. Scene transitions

Already in place:
- materials and pipelines are prepared in advance and reused;
- fog is skipped behind the opaque screen;
- scenes that aren't visible don't update outside transitions.

Options:
- **[none] Only shade what the wipe shows,** using a scissor or the wipe mask, and skip pixels that are fully covered.
- **[subtle] Freeze the outgoing scene** into a texture when the transition starts, or update it at reduced rate.
- **[subtle] Render both scenes at lower resolution during the overlap only.**
- **[subtle] Pause reflection updates, shafts and fog** during the overlap.
- **[visible] Shorten the overlap.**

### 3. Video playback

Already in place:
- phone encodes are 960 px at 30 fps, desktop 1920 px at 60 fps;
- streaming is capped to 30 or 60 fps and 960 or 1920 px;
- slides that aren't playing show their poster or the held last frame;
- Safari imports frames through `FrameImporter`;
- video widths are aligned to 16 px.

Options:
- **[none] Pause the screen and detail streams** when they're scrolled out of view or the tab is hidden. Settled project pages already fade out the screen light and shafts, so nothing else samples the video there.
- **[subtle] Wait for a swipe to settle before streaming.** Today the stream follows the rounded slide index mid-swipe, so a fast swipe starts every film it passes.
- **[subtle] Load home thumbnails on demand,** for tiles near the cursor, instead of keeping all 12 buffered. Preloading their files into the HTTP cache keeps the delay on the first hover short.
- **[subtle] Release a thumbnail's source once its film takes over,** at the cost of re-buffering when you return home.
- **[subtle] Encode phone films at 720 px or 24 fps.**

### 4. Ice

Already in place:
- the reflection runs at half resolution, every 2nd frame, with no MSAA, on the opposite frames to Meadow's;
- fog is left out of the reflection, ends at the depth buffer, and is skipped behind the opaque screen;
- fog uses 8 jittered steps.

Options:
- **[subtle] Leave snowfall out of the reflection pass.**
- **[subtle] Lower the phone snowflake count,** which is higher than desktop's (1,800 vs 1,023).
- **[subtle] Discard flakes hidden behind the screen** in the shader; frustum culling is off for the particle system.
- **[subtle] Smooth fewer fog samples over frames, or march fog at half resolution** and upsample with depth-aware filtering.
- **[subtle] Cheaper reflection on low:** 0.35 resolution or every 3rd frame. The `tiers.js` row is commented out.
- **[none] Bake static lighting and AO** into textures where the lighting never changes.

### 5. Meadow

Already in place:
- the water reflection runs at half resolution, every 2nd frame, with no MSAA;
- the tracking overlay is hidden in the reflection, and submerged leaves are discarded;
- fog has a screen depth mask;
- rain is one instanced draw that's skipped when its intensity is zero;
- roses are instanced with baked animation.

Options:
- **[none] Run `benchmarkMeadow()`** and record the result next to Ice and Cube.
- **[subtle] Leave rain and roses out of the water reflection,** where distortion and fading hide them.
- **[subtle] Fewer rain instances on phones.** Mobile settings only change rain intensity, cell size and opacity.
- **[subtle] Fewer roses and tracking walls on low** (11 walls today; the `trackingWallCount` row is commented out).
- **[subtle] Cheaper reflection on low:** 0.35 resolution or every 3rd frame. The `reflectionInterval` row is commented out.
- **[subtle] The same fog smoothing and half-resolution options as Ice.**

### 6. Pixel density

Already in place:
- DPR is set per tier and capped at 2;
- adaptive resolution;
- the About portrait renders at CSS resolution while its text stays sharp.

Options:
- **[subtle] Keep phones at the tier DPR on project pages,** or raise only the gallery and screen target to native resolution while the room stays at tier resolution. This is the largest memory lever on iPhone project pages: 1.5 instead of 2 means about 44% fewer pixels in every full-screen buffer.
- **[subtle] Render the 3D below native resolution and upscale it with a sharpening pass.**

### 7. Glass grid tiles

Already in place:
- glass isn't drawn once the tiles are fully hidden;
- About skips the whole persistent layer.

Options:
- **[subtle] Copy the backdrop at half resolution;** refraction blurs it anyway.
- **[subtle] Refresh the backdrop copy every other frame.**
- **[subtle] Turn off chromatic aberration (one backdrop sample instead of three) and inner refraction on low/medium.** The rows exist in `tiers.js`.
- **[subtle] Use enhanced glass only near the cursor,** and a cheaper material for the other tiles.

### 8. Light shafts

Already in place:
- both run at reduced resolution and are skipped when invisible;
- screen shafts are off on low and use 12 steps on medium;
- the march is jittered.

Options:
- **[none] Release the Cube shaft atlas** while Cube isn't shown.
- **[subtle] Fewer steps, smoothed over frames.**
- **[subtle] Update the shafts at half rate.**
- **[subtle] Cube shaft tier rows on low/medium** (they're commented out).

### 9. Screen light rendering

Already in place:
- the light source is a blurred 256×128 copy of the screen;
- the area-light math skips surfaces facing away from it;
- the lit wipe shades only a thin band at its edge, and is off on low.

Options:
- **[none] Skip the screen-light pass while its intensity is zero,** for example on settled project pages.
- **[none] Skip re-rendering the light source when the screen shows a still image.**
- **[subtle] Compute diffuse screen lighting per vertex** on large flat walls.

### 10. About page

Already in place:
- glow and blur come from a pre-blurred atlas (two texture samples);
- pulses and shimmer run in the vertex stage;
- the persistent layer is skipped;
- the portrait renders at CSS resolution;
- there's no MSAA.

Options:
- **[none] Cull glyphs outside the view.** Frustum culling is off and every glyph draws.
- **[subtle] Lower the phone portrait density,** which is higher than desktop's (0.9 vs 0.85). The existing `portraitResponsiveDensity` switch would scale the count with screen width, but it's off everywhere.
- **[visible] Fewer glyphs on the low tier.**

## Precomputing and loading on demand

The CPU timings below were measured in Node on the dev Mac. Phones are typically several times slower.

### Baking the screen video's light into a timecoded buffer

It wouldn't make anything measurably faster, so it isn't worth building.

- **Only a tiny part of the work depends on the video.** Each frame, the screen is rendered into the 256×128 light source, which is then blurred down to 16×8. That's a few microseconds of GPU time.
- **The cost is the per-pixel area-light math on every lit surface.** That covers the Ice floor, the Meadow water, plant wall and roses, and the Cube walls, from both sides of the screen. For each pixel this means:
  - two lookup-table reads;
  - two polygon integrations;
  - a ray–plane intersection;
  - two samples of the light source.

  The inputs are the surface's position and normal, the camera, and the screen's corners, not the video. A precomputed video buffer would still feed this same math.
- **Baking the lit result on the surfaces isn't feasible.** It would need a lightmap per video frame, per scene and per aspect ratio. The screen quad is re-fitted to the camera ray every frame, so even its geometry isn't constant. The screen also shows idle shaders and transitions that react to input.
- **Syncing a buffer to video timestamps** adds failure cases (seeking, looping, stalls) for no gain.

If the screen light needs to get cheaper, the levers are the per-surface options under item 9.

### Loading on demand without frame drops

This is possible. Decoding already happens off the render thread; what drops frames is the work that runs on the render worker afterwards.

When a project's gallery is prepared (after a short hover, or when its page opens), each image goes through these steps:

1. **`fetch`:** asynchronous, no cost to the render thread.
2. **`createImageBitmap`:** asynchronous; decoding happens off the thread.
3. **A CPU blur in `gaussianBlur.js`.** It runs for portrait images, detail items, and every image on desktop. Each one does a canvas draw and `getImageData` readback, a linear-light conversion, then a separable Gaussian in JavaScript.
   - Measured cost: 10.5 ms for a portrait (128×228) and 3.4 ms for a landscape image (128×72), on top of the canvas readback.
   - Each blur source also keeps three float buffers for the debug slider: about 1 MB per portrait image.
4. **`initTexture`:** the upload plus mipmap generation. In shipping Safari, `copyExternalImageToTexture` copies through the CPU; that's what `FrameImporter` avoids for video. A 1080 px image upload therefore likely costs a few milliseconds of render-thread time too (not measured).
5. **`compileAsync`:** already asynchronous, and pipelines are cached after the first gallery.

Images go through these steps one at a time, so each of them can cost a frame.

`requestIdleCallback` doesn't help here, for three reasons:
- it's a Window-only API, so it doesn't exist in the render worker;
- Safari doesn't ship it;
- the main thread's idle time says nothing about the worker's frame budget.

The worker's own render loop is the right clock.

Options:
- **[none] Bake the gallery blur into the asset build** (`scripts/optimize-projects.mjs`): ship the 128 px blurred version as a small PNG next to each image and poster. The blur pixels match if the build uses the same linear-light Gaussian and the same sigma (7). It removes the render-thread blur and the float buffers it keeps. The live `galleryBlurRadius` slider can keep the runtime path behind `?debug`.
- **[none] Add a frame-budget job queue to the worker.** In `raf.js`, once `dispatcher.triggerOnRaf` resolves, run at most one queued heavy job, and only if the frame took less than about half its interval so far. Heavy jobs are texture uploads, blur sources and texture creation. Run none during transitions, swipes, or the first frames after a page switch. Gallery preparation, `_loadStill` and poster uploads queue jobs instead of running them inline.
- **[none] Wait for the GPU between uploads.** Before each upload, await `device.queue.onSubmittedWorkDone()`, so uploads don't pile up behind a heavy frame. `prepareScenes` already does this during loading.
- **[none] Upload large images in strips across frames.** WebGPU's `copyExternalImageToTexture` accepts a source origin and size, but three uploads whole textures. This would need a raw-device path like `FrameImporter`'s, so it's only worth it if uploads still show up after adding the queue.
- **[none] Schedule main-thread loading** (home thumbnails, DOM images) with `requestIdleCallback`, falling back to `setTimeout` on Safari. Main-thread stalls don't drop canvas frames directly, but they do delay video frames and input forwarded to the worker.
- **[subtle] KTX2 images with prebuilt mipmaps** upload compressed and skip GPU mipmap generation (see item 1).

### Other work to precompute

Already precomputed:
- MSDF font atlases (`scripts/generate-msdf.mjs`);
- the shader cache;
- pipelines, prepared during loading (`prepareScenes`);
- the plant wall (`scripts/build-meadow-wall.py`);
- the rose animation, baked as a vertex animation texture;
- video and image encodes (`scripts/optimize-videos.mjs` and `scripts/optimize-projects.mjs`);
- noise, sampled from textures instead of computed per pixel;
- About's shimmer and scatter noise, computed in the vertex stage.

There are no shadow maps to freeze: nothing casts shadows.

These are all deterministic, so baking them into files gives identical pixels. They only speed up loading, not the frame rate.
- **[none] Bake the noise textures:**
  - the 64³ 3D Perlin volume: 21 ms;
  - Ice's 256² four-octave texture: 12 ms;
  - Meadow's 128² texture: 3 ms.

  All use a fixed seed. The trade-off is download size: the 3D volume is 512 KB as half floats. Generating them in a separate worker in parallel with other loading also takes them off the render worker.
- **[none] Bake the glyph glow atlas** (`glyphCoverageAtlas.js`) into `generate-msdf.mjs`. Today, when About's text and the glyph particles are created, it reads the MSDF atlas back through a canvas. Each glyph then gets 4 blur radii, each made of 3 box-blur passes in 2 directions.
- **[none] Bake the transition wipe volume** (`wipeTexture.js`, a 64³ volume built from the transition pattern image) into a 256 KB file, and keep the runtime path for the debug image upload.
