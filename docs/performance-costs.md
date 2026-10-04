# Most expensive rendering costs

The ten costs with the largest performance impact, ordered by their effect on the phones that crash first, then on desktop. Every item was checked against the code; each one lists what is already in place, so the options below it are only those that aren't.

Measured costs: Ice, Cube, About and transitions (see `scenes-performance.md`, `about-performance.md` and `transition-performance.md`), Meadow (item 5), and GPU memory on a 393×735 @3 project page. Everything else is estimated from the code and settings.

The `[none]` options that were implemented, and the ones that weren't (with reasons), are summarised under [Implemented](#implemented) at the end.

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

5. **Meadow scene.** `benchmarkMeadow()` (`scripts/benchmark-meadow.js`) at 2880×1800 with 4× MSAA, in headless Chrome on the M3 Max, two runs each:
   - idle: median 7.9–8.1 ms, P95 8.2–9.1 ms;
   - 64 roses and eight ripples: median 8.4–8.5 ms, P95 8.9–9.3 ms.

   That is just inside the 120 fps budget (8.33 ms) when idle and just over it with roses. The scene includes:
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

9. **Screen light rendering.** The cost is the per-pixel area-light math on lit surfaces in Ice, Meadow and Cube. Its light source is no longer redrawn on project pages and About, where nothing samples it. Its other costs are already low:
   - the light source is a blurred 256×128 copy of the screen;
   - the area-light math skips surfaces facing away from the screen;
   - the lit wipe only shades a thin band at its edge, and is off on low.

10. **About page.** It runs at about 6 ms, with:
    - about 17,700 glyphs in one draw, none of them culled when off screen;
    - about 85,000 portrait particles on desktop and 90,000 on phones.

There's also a one-off cost: the startup loader compiles 31 shader variants, which makes loading longer but stops first-frame stalls. Textures that used to be generated during loading are now baked into files (see [Implemented](#implemented)).

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

Already in place: a 60 fps cap (`src/shared/frameLimit.js`), adaptive resolution (`src/offscreen/utils/AdaptiveResolution.js`), quality tiers, shader pre-compilation during loading, and per-pass GPU timing in the three.js Inspector's Performance tab under `?debug`.

- **[none] Stop the render loop while the tab is hidden.** Done.
- **[none] Render only when something changes.** Not done: nothing on screen is ever static. Even a settled project page has the animated backdrop, and the scenes have snow, rain, particles and idle screen shaders, so skipped frames would freeze visible motion.
- **[subtle] Run settled pages at 30 fps.** The component helper already supports `raf: { fps }`, but `Site` uses `Infinity`.
- **[subtle] Let adaptive resolution go below 1.5 on phones** (for example down to 1.0). Its floor is `min(1.5, base DPR)`, which pins phones at 1.5.
- **[subtle] Lower DPR during transitions, swipes and fast scrolls,** and restore it when things settle.
- **[visible on low/medium] Fill in the commented-out `tiers.js` rows:** glass, Meadow reflections and tracking walls, Cube particles and shafts, the Ice reflection, and fog.

### 1. Full-screen render buffers

Already in place:
- scenes share a gbuffer pool of 2;
- shaft, fog and screen-light passes have no depth buffer;
- gallery textures are released when leaving a page;
- the screen light source is a fixed 256×128.

Options:
- **[none] Release About's gbuffer when About isn't shown,** and re-create it during the transition in. The same goes for other off-screen scenes' targets: the Cube shaft atlas, the reflection targets, and the rose animation texture. Not done: re-allocating full-screen targets lands on the first frame of a transition, already the slowest frames measured, and that can't be checked for stutter on an iPhone from here. Worth trying with on-device timing.
- **[none] Share one depth buffer** between same-size passes that run one after another. Not done: the scene output and gbuffers use 4× MSAA on desktop while About's gbuffer and the screen target don't, and WebGPU attachments must match in sample count. The screen target's depth must also survive the frame, because the depth compositor samples it after the scenes render.
- **[none] Load gallery media for the active slide and its neighbours only.** Today every image and poster is fetched and kept. Not done: a fast swipe would reach slides that haven't loaded yet, so they would pop in, which is a visible change.
- **[subtle] Store HDR buffers as `rg11b10ufloat`** where no alpha is needed. It halves their memory; it needs the `rg11b10ufloat-renderable` feature, with a fallback where that's missing.
- **[subtle] Compress gallery images to KTX2,** about 4× smaller in GPU memory, or ship 720 px posters on phones.
- **[subtle] Skip gallery mipmaps** where slides are never drawn much smaller than their size.

### 2. Scene transitions

Already in place:
- materials and pipelines are prepared in advance and reused;
- fog is skipped behind the opaque screen;
- scenes that aren't visible don't update outside transitions.

Options:
- **[none] Only shade what the wipe shows,** using a scissor or the wipe mask, and skip pixels that are fully covered. Not done: the wipe is a noise-shaped mask across the whole screen, so for most of the transition a scissor rectangle covers nearly everything. Discarding by mask means changing every scene material, which also invalidates the precompiled shader cache.
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
- **[none] Pause the screen and detail streams** when they're scrolled out of view or the tab is hidden. Done for detail streams, and for the screen and detail films while the tab is hidden. The screen stream keeps playing when the gallery scrolls away: the same texture feeds the room's screen, which can stay visible behind the page, so pausing it could freeze a visible picture.
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
- **[none] Release the Cube shaft atlas** while Cube isn't shown. Not done, for the same reason as About's gbuffer (item 1).
- **[subtle] Fewer steps, smoothed over frames.**
- **[subtle] Update the shafts at half rate.**
- **[subtle] Cube shaft tier rows on low/medium** (they're commented out).

### 9. Screen light rendering

Already in place:
- the light source is a blurred 256×128 copy of the screen;
- the area-light math skips surfaces facing away from it;
- the lit wipe shades only a thin band at its edge, and is off on low.

Options:
- **[none] Skip the screen-light pass while its intensity is zero,** for example on settled project pages. Done for the light source: it isn't redrawn while no rendered scene samples it and the screen shafts are hidden, and once the screen is gone it's cleared once rather than every frame. The per-surface lighting itself has no zero-intensity case to skip: its intensity is 20 unless changed in the debug panel, and branching in those shaders would invalidate the shader cache.
- **[none] Skip re-rendering the light source when the screen shows a still image.** Not done: the light source is drawn from the composed screen, which keeps animating over a still (idle shader, enter and exit wipes), so a cached copy would drift from what the screen shows.
- **[subtle] Compute diffuse screen lighting per vertex** on large flat walls.

### 10. About page

Already in place:
- glow and blur come from a pre-blurred atlas (two texture samples);
- pulses and shimmer run in the vertex stage;
- the persistent layer is skipped;
- the portrait renders at CSS resolution;
- there's no MSAA.

Options:
- **[none] Cull glyphs outside the view.** Frustum culling is off and every glyph draws. Not done: the GPU already clips off-screen glyphs before they produce pixels, so culling would only save vertex work: one quad per glyph, about 17,700 in one draw. That's too little to measure against the per-frame CPU or compute cost of culling.
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

When a project's gallery is prepared (after a short hover, or when its page opens), each image went through these steps before the changes listed under [Implemented](#implemented):

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
- **[none] Bake the gallery blur into the asset build** (`scripts/optimize-projects.mjs`): ship the 128 px blurred version as a small file next to each image and poster, using the same linear-light Gaussian and sigma (7). It removes the render-thread blur and the float buffers it keeps. Done, with the runtime path kept behind `?debug` for the `galleryBlurRadius` slider. It isn't bit-identical to a browser's own canvas downscale, but it stays within the spread between Chrome's own canvas backends (see [Implemented](#implemented)).
- **[none] Add a frame-budget job queue to the worker.** In `raf.js`, once `dispatcher.triggerOnRaf` resolves, run at most one queued heavy job. Gallery uploads and `_loadStill` queue jobs instead of running them inline. Done as one job per frame. Not done: skipping jobs based on how long the frame took, or pausing them during transitions and swipes. Phones run near their budget, so images would wait indefinitely; one job per frame already removed the long frames measured.
- **[none] Wait for the GPU between uploads.** Before each upload, await `device.queue.onSubmittedWorkDone()`, so uploads don't pile up behind a heavy frame. `prepareScenes` already does this during loading. Not done: it adds a GPU round trip before every upload, so images appear later, and the queue already spaces uploads one frame apart.
- **[none] Upload large images in strips across frames.** WebGPU's `copyExternalImageToTexture` accepts a source origin and size, but three uploads whole textures. Not done: it needs a raw-device path like `FrameImporter`'s, and with the queue in place uploads no longer show up as long frames.
- **[none] Schedule main-thread loading** (home thumbnails, DOM images) with `requestIdleCallback`, falling back to `setTimeout` on Safari. Main-thread stalls don't drop canvas frames directly, but they do delay video frames and input forwarded to the worker. Not done: Safari would always take the `setTimeout` fallback, home thumbnails already load one at a time after startup, and main-thread idle time says nothing about the worker's frame budget.
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

  All use a fixed seed. Done for the two 2D textures. The 3D volume isn't baked: even compressed it's 360 KB, which costs more to download than to compute. Instead, it's now built in small chunks while the other assets download.
- **[none] Bake the glyph glow atlas** (`glyphCoverageAtlas.js`) into `generate-msdf.mjs`. When About's text and the glyph particles were created, it read the MSDF atlas back through a canvas. Each glyph then got 4 blur radii, each made of 3 box-blur passes in 2 directions. Done.
- **[none] Bake the transition wipe volume** (`wipeTexture.js`, a 64³ volume built from the transition pattern image) into a 256 KB file, and keep the runtime path for the debug image upload. Not done: it takes 3.5 ms to build, less than downloading 256 KB.

## Implemented

Everything below gives the same pixels as before, except for the gallery blur, whose difference is quantified in its entry. Each baked file has a fallback: if a file is missing, fails to load, or no longer matches its expected size, the runtime builds the texture itself as it did before. Two flags in `src/shared/flags.js` switch the baked files off entirely (see [Memory](#memory)).

### Baked into files

| File | Size | Replaces at runtime |
| --- | ---: | --- |
| `public/assets/textures/baked/fbm-256-4-0.5.bin` | 42 KB | Ice's noise texture: 12 ms |
| `public/assets/textures/baked/fbm-128-4-0.5.bin` | 17 KB | Meadow's fog noise: 3 ms |
| `SpaceMono-Regular.glow-all.bin` (next to the MSDF atlas) | 182 KB | About's glyph glow atlas: 58–81 ms, plus the canvas readback |
| `SpaceMono-Regular.glow-particles.bin` | 47 KB | Cube's particle glow atlas: 12–18 ms |
| `public/assets/media/*/*.blur7.webp` (180 files) | 6–15 KB each, 1.3 MB in total | each gallery blur: 3.4–10.5 ms, plus the 128 px canvas readback |

- **Noise and glyph atlases** are stored as gzipped planes in a gradient-predictor format (`src/shared/bakedPlanes.js`) and inflated by the loader with `DecompressionStream`. The parameters they were baked with live in `src/shared/bakedTextures.js`, next to the paths. Both decode byte-identically to what the runtime generates; the MSDF atlas pixels read in Chrome's worker matched the decode the bake script uses.
- **The 3D noise volume** isn't a file (see above). `prepareNoiseTexture3D()` builds it 8 slices per task while assets download, and `perlin3D` finishes any slices left.
- **Gallery blurs** are lossless WebP files, one per still and poster (desktop and mobile). The gallery only downloads the ones it shows blurred. On touch devices that's the details and portraits; otherwise, also every image slide. A baked blur is used only if its size matches the image it belongs to. `?debug` always blurs at runtime, so the `galleryBlurRadius` slider keeps working; `ENABLE_BAKED_GALLERY_BLURS = false` does the same without `?debug`. Files are named by sigma (`.blur7.webp`): after changing `galleryBlurRadius` in `params.js`, re-run `npm run media:projects`, or the gallery falls back to runtime blurs.

  The bake can't reproduce a browser's canvas downscale exactly, and browsers don't agree with each other either. Measured against Chrome's runtime path on all 180 stills, on a 0–255 scale:

  | Compared with Chrome's GPU canvas (the runtime path) | Max | Mean | Channels off by more than 2 |
  | --- | ---: | ---: | ---: |
  | Baked file | 9 | 0.45 | 0.76% |
  | Chrome's CPU canvas (`willReadFrequently`) | 11 | 0.25 | 0.58% |

  The largest differences sit on small highlights; Safari's downscale differs from both. The bake decodes with accurate chroma (which matched libwebp's decode exactly in tests) and downscales bilinearly. Downscaling in linear light, area filtering and mipmapping all matched worse.

Commands:
- `npm run textures:bake` writes the noise and glyph files. `npm run fonts:msdf` now runs it after generating the atlases.
- `npm run media:projects` writes the gallery blurs along with the other renditions, and skips them when they're newer than their still.

### Loading and frame pacing

- **Uploads between frames** (`src/offscreen/utils/frameJobs.js`). `afterFrame(job)` runs at most one queued job right after a frame finishes, from `raf.js`; a 250 ms timer covers stretches without frames, such as a hidden tab. Gallery texture uploads and `_loadStill` go through it. Gallery images are decoded strictly one at a time: the next decode starts only once the previous bitmap has been uploaded and freed (see [Memory](#memory)).

  Measured as worker frame gaps over the 7 s after opening a project, three projects × two runs, in headless Chrome on the M3 Max. "Before" is a production build of the commit before these changes:

  | Build | Setup | Frames over 25 ms | Worst frame |
  | --- | --- | ---: | ---: |
  | before | desktop | 9 | 66.7 ms |
  | after | desktop | 5 | 33.4 ms |
  | before | phone emulation, 4× CPU throttle | 5 | 33.4 ms |
  | after | phone emulation, 4× CPU throttle | 1 | 33.4 ms |

  33.4 ms is a single missed frame at 60 Hz. A later desktop run (one run of the same three projects), after decoding was made strictly sequential, had no frames over 25 ms with baked blurs, and one per project open with runtime blurs.
- **Less loader work.** Removing the noise and glyph generation takes about 85–115 ms of CPU off the render worker on the dev Mac, several times more on phones. The noise volume now builds while assets download. The baked noise and glyph files are still startup downloads (Ice and Meadow noise and Cube's glow as their scenes' `static resources`, About's atlas in the common resources). Every scene is built and its shaders prepared during loading, so deferring them would move that work into the first transition into each scene.
- **On demand:** gallery blurs download with the rest of a gallery, when it's prepared after a short hover or when its page opens.

### Rendering

- **Hidden tab.** The worker skips frames while `document.hidden` (forwarded as a `visibility` event), because worker `requestAnimationFrame` isn't throttled with the page in every browser. The screen and detail films pause while the tab is hidden and resume when it's shown.
- **Detail streams out of view.** A detail film more than half a viewport off screen pauses (`VideoChannel.hold`); its last frame stays on the texture, and it resumes when it comes back.
- **Screen light source.** Its 256×128 light source isn't redrawn while no rendered scene samples it (Project and About set `screenLit = false`) and the screen shafts are hidden. When the screen itself is gone, the light source is cleared once instead of every frame.

### Memory

iOS counts the render worker's JS heap, its ArrayBuffers, decoded image bitmaps and GPU memory against the tab. Once loading has finished, the baked files take no more memory than the runtime path they replace, and the gallery blurs take less. Each can still be switched back to the runtime path in `src/shared/flags.js` (both are `true`):

- `ENABLE_BAKED_TEXTURES`: `false` generates the noise and glyph glow textures while loading, as before, and doesn't download them.
- `ENABLE_BAKED_GALLERY_BLURS`: `false` blurs gallery images on the render worker and doesn't download the blur files.

| Item | Kept after loading, baked | Kept after loading, runtime | What baking saves |
| --- | --- | --- | --- |
| Noise and glyph glow textures | 3.9 MB of texture data (About's atlas 2.97 MB, particle atlas 0.71 MB, noise 0.25 MB) | the same 3.9 MB | 85–115 ms of render-worker CPU at startup on the dev Mac; no MSDF atlas readback or per-glyph float scratch |
| Gallery blurs | a 128 px bitmap per blurred image (117 KB for a portrait) | a 128 px texture plus three float buffers for the debug slider: about 1.2 MB for a portrait, 0.4 MB for a landscape image | 3.4–10.5 ms of render-worker CPU per image, about one dropped frame per project open on desktop |

GPU memory is the same in both modes: the textures are identical in size and format.

While checking this, four things were found to hold more memory than they needed; all four are fixed:

- **The loader kept its copy of the baked planes.** `loader.take(name)` hands an asset to its only user and drops the loader's reference, so the 3.9 MB of inflated planes isn't held twice.
- **Two gallery bitmaps could be decoded at once.** Decoding the next image while the previous one waited to upload kept a second full-size bitmap alive: up to 4.7 MB extra on phones (1080 × 1080) and 15 MB on desktop. Decoding is now strictly one image at a time.
- **About's glow atlas was rebuilt whenever the wall was.** Touch rotation rebuilds the wall; the atlas only depends on the font, so it's now built once and kept until About is disposed. That also removes a rebuild hitch.
- **Closed galleries kept their blur buffers.** A disposed `ProjectGallery` stays referenced somewhere, so its runtime blur buffers were never freed: worker ArrayBuffers grew from 85.5 to 97.4 MB over six gallery visits. `dispose()` now clears its texture and blur maps, so whatever still references a closed gallery no longer keeps its buffers alive. What still holds the gallery hasn't been found.

Worker memory over six gallery visits (desktop, headless Chrome, after forced garbage collection, after the fixes above):

| Mode | ArrayBuffers after loading | ArrayBuffers across the six visits | JS heap after loading → after the sixth visit |
| --- | ---: | ---: | ---: |
| Baked (flags on) | 81.5 MB | 81.5 MB, flat | 37.5 → 39.7 MB |
| Runtime (flags off) | 84.4 MB | 82.7–85.6 MB, following the open gallery's size | 37.4 → 39.7 MB |

The runtime path carries an extra 1–4 MB, which is the open gallery's blur buffers. The same gallery measured 82.7 MB on the first visit and 83.4 MB on the last, so a small remainder isn't freed or hadn't been collected yet; the baked path doesn't have it. The JS heap grows about 0.15 MB per visit in both modes, after a 1.4 MB jump on the first visit. Image bitmaps aren't part of these numbers.

### Verified

- Production build passes. The `THREE.Source` rename warning comes from `GridTile.js` and predates these changes.
- Desktop and phone-emulation runs of home, a project page with its details, About, Ice, Cube and Meadow: every baked file loaded, with no new errors.
- The same runs with both baked flags off: no baked file is requested, and there are no errors. The only warnings in either mode are the missing three-blocks shader manifest and the `THREE.Source` rename, both from before these changes.
- Pixel checks: noise and glyph atlases byte-identical; gallery blurs as in the table above.
