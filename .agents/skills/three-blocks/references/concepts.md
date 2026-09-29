# Concept rules

17 integration rules. Each ships the correct and the incorrect pattern — match user code against the incorrect one first.

## Choosing blocks

Choose and integrate choosing blocks without leaving GPU work or browser fallbacks implicit.

Problem: A production goal can cross material, motion, interaction, text, simulation, and rendering families, so sorting blocks into outcome categories hides useful combinations.

Model: Start from what still needs to react, then choose the representation, lifecycle, quality tier, and fallback that preserve that response.

Rule: Use the catalogue to answer a goal, then narrow the result by family, renderer, kind, and stability.

Correct: Choose blocks from the required runtime response and validate the complete composition on its target devices.

Incorrect: Treat one showcase category as a fixed architecture and inherit blocks whose runtime freedoms or costs do not fit the result.

Canonical: https://threejs-blocks.com/docs/concepts/choosing-blocks

## Precompiled shaders

Choose and integrate precompiled shaders without leaving GPU work or browser fallbacks implicit.

Problem: A first visit can discover and compile shader pipelines during the visible frame, while an old capture can silently stop matching edited TSL inputs.

Model: Edit TSL with live fallback → settle the shader → click Capture in the overlay for the current scene → verify the fresh receipt → use the CLI for route batches → require freshness in the strict production build.

Rule: Treat precompiled shaders as a versioned optimization cache: live compilation keeps editing unblocked, and a strict build prevents stale receipts from shipping.

Correct: Once shader-relevant imports settle, click Capture in the development overlay, use the CLI fallback when multiple routes changed, commit the saved shader and receipt together, then run the strict build and production preview.

Incorrect: Recapture after every unrelated copy edit, or deploy a stale manifest while claiming the first frame is precompiled.

Canonical: https://threejs-blocks.com/docs/concepts/precompiled-shaders

## Worker-owned rendering

Choose and integrate worker-owned rendering without leaving GPU work or browser fallbacks implicit.

Problem: A page can lose lifecycle, restart, and development evidence when its renderer and GPU resources move behind an ad hoc worker boundary.

Model: Page owns DOM and input → WorkerHost transfers and replays state → worker owns renderer and frame loop → typed evidence returns to the page.

Rule: Keep browser state on the page, GPU state in the worker, and every lifecycle or diagnostic message on the governed protocol.

Correct: Use WorkerHost and createWorkerRuntime for the standard Three.js shell, or deliberately own canvas replacement and evidence when using the lower-level worker transport.

Incorrect: Scatter postMessage calls across page and worker code, then rebuild restart, error, stats, and smoke behavior independently.

Canonical: https://threejs-blocks.com/docs/concepts/worker-owned-rendering

## WebGPU renderer initialization

Choose and integrate webgpu renderer initialization without leaving GPU work or browser fallbacks implicit.

Problem: WebGPU resources can be requested before the renderer has selected and initialized its device.

Model: Create renderer → await renderer.init() → create GPU-backed blocks → enter the frame loop.

Rule: Await renderer initialization before any block allocates storage, compute pipelines, or render resources.

Correct: Initialize once at the application boundary, then construct the scene and its blocks.

Incorrect: Construct GPU systems during module evaluation and hope the first render initializes them in time.

Canonical: https://threejs-blocks.com/docs/concepts/webgpu-initialization

## Compute before render

Choose and integrate compute before render without leaving GPU work or browser fallbacks implicit.

Problem: A render pass can read last frame's storage when simulation, sampling, or culling updates happen too late.

Model: Input update → compute/simulation dispatch → indirect/culling update → render.

Rule: Schedule every producer before the render pass that consumes its storage for the current frame.

Correct: Keep frame ordering visible in one coordinator or documented block lifecycle.

Incorrect: Hide compute dispatches in unrelated effects that may run after render.

Canonical: https://threejs-blocks.com/docs/concepts/compute-before-render

## Storage buffers and GPU ownership

Choose and integrate storage buffers and gpu ownership without leaving GPU work or browser fallbacks implicit.

Problem: Copying large transforms or fields between CPU and GPU destroys the scale that compute blocks are meant to provide.

Model: One owner allocates storage; producers and consumers share typed views without readback.

Rule: Name the owner, writer, readers, lifetime, and disposal path for every shared GPU resource.

Correct: Pass storage attributes directly from sampling to culling and rendering.

Incorrect: Read transforms to JavaScript every frame and upload them again for the next block.

Canonical: https://threejs-blocks.com/docs/concepts/gpu-ownership

## TSL composition

Choose and integrate tsl composition without leaving GPU work or browser fallbacks implicit.

Problem: Reusable node effects become brittle when they assume a material, coordinate space, or render stage that callers cannot see.

Model: Typed node inputs → explicit coordinate transform → composable node output → material or post-pass slot.

Rule: State the node's input space, output type, and required stage before composing it.

Correct: Compose small nodes at the material boundary and keep changing parameters in uniforms.

Incorrect: Rebuild a node graph every frame or mix world, view, and screen coordinates implicitly.

Canonical: https://threejs-blocks.com/docs/concepts/tsl-composition

## SDF versus BVH constraints

Choose and integrate sdf versus bvh constraints without leaving GPU work or browser fallbacks implicit.

Problem: SDF and BVH constraints answer similar spatial questions with distinct update, memory, and precision costs.

Model: SDF: sampled field with cheap GPU lookup. BVH: geometric hierarchy with direct surface queries.

Rule: Choose the representation from update frequency, required sign/precision, query count, and memory, not from naming.

Correct: Use a stable SDF for many cheap field samples; keep BVH queries for geometry that needs direct surface precision.

Incorrect: Rebuild a dense SDF every frame when a small number of BVH queries would answer the interaction.

Canonical: https://threejs-blocks.com/docs/concepts/sdf-versus-bvh

## PBF versus SPH versus MPM

Choose and integrate pbf versus sph versus mpm without leaving GPU work or browser fallbacks implicit.

Problem: PBF, SPH, and MPM can all look fluid in a demo while exposing different stability and material behavior in production.

Model: PBF solves positional density constraints; SPH integrates pressure forces; MPM transfers particle state through a grid.

Rule: Choose from the required material response and quality ladder, then measure the full render path.

Correct: Prototype the same interaction and particle count in the two plausible solvers before locking authoring work.

Incorrect: Pick the solver with the most visually similar screenshot and inherit its tuning accidentally.

Canonical: https://threejs-blocks.com/docs/concepts/simulation-choice

## When bytes enter memory

Choose and integrate when bytes enter memory without leaving GPU work or browser fallbacks implicit.

Problem: Animation and capture assets trade startup delay for decode complexity, buffering, and mid-playback risk.

Model: Every media block streams through WebCodecs; what you choose is how a resource is fetched and how much decoded residency it may hold.

Rule: Budget the encoded body and the decoded working set separately, and keep a host-owned result visible until the first real frame.

Correct: Fetch whole verified resources by default, opt into verified range segments only for view-dependent grids on Range-capable servers.

Incorrect: Raise a global GPU limit to make a resource-budget rejection go away instead of keeping the poster.

Canonical: https://threejs-blocks.com/docs/concepts/streaming-versus-preloading

## Lifecycle and disposal

Choose and integrate lifecycle and disposal without leaving GPU work or browser fallbacks implicit.

Problem: GPU memory, workers, event listeners, and animation loops outlive the visual route unless ownership is explicit.

Model: Initialize → update/resize/pause → stop producers → dispose consumers and owned resources.

Rule: Every complete integration states who starts, pauses, resizes, and disposes the block.

Correct: Stop the animation loop and worker input before disposing shared GPU resources.

Incorrect: Remove the canvas while timers, decoders, or storage buffers remain live.

Canonical: https://threejs-blocks.com/docs/concepts/lifecycle-and-disposal

## Performance ladders and mobile fallbacks

Choose and integrate performance ladders and mobile fallbacks without leaving GPU work or browser fallbacks implicit.

Problem: One quality setting cannot cover desktop GPUs, mobile thermals, reduced motion, and browsers without WebGPU.

Model: Detect capability → select a named tier → measure its whole-frame budget → retain a useful static or simpler fallback.

Rule: Design the quality ladder with the block; do not bolt it on after the highest tier is approved.

Correct: Scale resolution, passes, samples, counts, and DPR together around measured targets.

Incorrect: Lower only particle count while an unchanged full-resolution compositing pass still dominates.

Canonical: https://threejs-blocks.com/docs/concepts/performance-ladders

## MSDF versus runtime SDF text

Choose and integrate msdf versus runtime sdf text without leaving GPU work or browser fallbacks implicit.

Problem: Baked MSDF and runtime SDF text can both draw sharp glyphs, but they move charset, startup, worker, and fallback costs to different parts of the product.

Model: MSDF: known glyphs become a deploy-time atlas. Runtime SDF: unknown text becomes glyph work and cache ownership in the browser.

Rule: Bake a known product charset; choose runtime generation only when user or remote content can introduce glyphs after deployment.

Correct: Ship interface and campaign copy in a versioned MSDF atlas, then isolate genuinely dynamic text behind the runtime worker and cache boundary.

Incorrect: Pay runtime glyph generation for a fixed headline, or omit required locales from a baked atlas and discover missing glyphs in production.

Canonical: https://threejs-blocks.com/docs/concepts/msdf-versus-runtime-sdf-text

## Baked Motion versus VAV versus OAV

Choose and integrate baked motion versus vav versus oav without leaving GPU work or browser fallbacks implicit.

Problem: Baked Motion, VAV, and OAV all move animation work into authored media, but preserve different freedoms at runtime.

Model: Baked Motion preserves approved pixels and bounded viewpoints; VAV preserves a deforming mesh; OAV preserves rigid-object transforms.

Rule: Choose the smallest representation that preserves the camera, lighting, geometry, material, and object-level controls the experience must still change.

Correct: Use Baked Motion for a controlled hero view, VAV for a deforming surface that still needs live material or camera response, and OAV for many rigid transforms.

Incorrect: Select by payload extension alone and discover after authoring that the runtime cannot relight, reframe, or address the required object.

Canonical: https://threejs-blocks.com/docs/concepts/baked-motion-versus-vav-oav

## Splats versus live mesh versus render-baked presentation

Choose and integrate splats versus live mesh versus render-baked presentation without leaving GPU work or browser fallbacks implicit.

Problem: A live mesh, Gaussian splat capture, and render-baked presentation can show the same product while exposing very different editing, lighting, camera, and delivery budgets.

Model: Live mesh maximizes runtime control; splats preserve captured appearance and view-dependent detail; render-baked media preserves approved pixels inside authored views.

Rule: Rank required runtime freedoms first, then compare capture cleanup, payload, sorting/decoding, fallback, and target-device cost.

Correct: Keep a production mesh for independent lighting and material changes, use splats for captured detail, or use Baked Motion when composition matters more than free camera motion.

Incorrect: Choose the representation from one desktop screenshot without testing mobile memory, fallback behavior, or the final interaction envelope.

Canonical: https://threejs-blocks.com/docs/concepts/splats-versus-live-mesh-versus-baked

## Hardware geometry versus sphere impostors

Choose and integrate hardware geometry versus sphere impostors without leaving GPU work or browser fallbacks implicit.

Problem: Dense particle fluids can spend their budget on repeated sphere vertices or move silhouette and depth reconstruction into fragment shading.

Model: Hardware spheres scale vertex and triangle work with tessellation; one-triangle impostors trade that geometry for per-pixel sphere intersection, depth, and normal work.

Rule: Measure both paths at the target particle size and overdraw; impostors win only when saved geometry exceeds their fragment and depth cost.

Correct: Use geometry for large, close, low-count spheres and validate impostors in the final scene when their projected footprint remains bounded.

Incorrect: Assume one triangle is always cheaper while large overlapping impostors saturate fragment shading and bandwidth.

Canonical: https://threejs-blocks.com/docs/concepts/hardware-geometry-versus-sphere-impostors

## Proxy bodies versus full-surface fields

Choose and integrate proxy bodies versus full-surface fields without leaving GPU work or browser fallbacks implicit.

Problem: A moving person can drive a simulation as a handful of analytic volumes or as a rebuilt signed field of their actual skin, and the cheaper tier is very often the correct product answer.

Model: Proxy volumes publish a few moving spheres, boxes, or capsules into a shared interaction world; a full-surface field rebuilds a signed distance and surface-velocity grid from the skinned triangles every frame and answers every query with one texture fetch.

Rule: Choose proxies when the body is an input to the experience, and a full-surface field when the body's own shape is the experience.

Correct: Ship proxy volumes for crowd-scale, multi-person, mobile, or shape-agnostic interaction, and reserve the field for the moments where silhouette, hands, or clothing must be visibly exact.

Incorrect: Treat proxies as a degraded fallback and pay for full-surface reconstruction in a scene where nobody can see the difference, or expect one field to serve a room full of visitors.

Canonical: https://threejs-blocks.com/docs/concepts/proxy-bodies-versus-full-surface-fields

