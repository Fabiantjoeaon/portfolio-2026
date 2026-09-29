# Curated block contracts

22 curated blocks. Canonical pages under https://threejs-blocks.com/docs/blocks/<slug>; exact per-symbol signatures at https://threejs-blocks.com/docs/raw/api/<symbol-slug>.

## Transmission

Render controllable refractive depth for glass and translucent product surfaces with an explicit quality cost.

Canonical: https://threejs-blocks.com/docs/blocks/transmission

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: The product must keep live camera, light, roughness, thickness, or environment response while reading as refractive depth.

Choose something else when: Use an opaque physical material when refraction is not visible, or Baked Motion when the approved pixels matter more than live relighting and free camera motion.

Lifecycle: Create MeshTransmissionNodeMaterial only after the WebGPU renderer is initialized and the environment strategy is known. Update camera, object, and uniform values before render; do not rebuild the node material in the animation loop. Resize the renderer/camera normally and re-evaluate sample count or DPR when screen coverage changes materially. Dispose the material plus caller-owned geometry, environment textures, and render targets after stopping the loop.

Performance: Screen coverage, transparent overlap, refraction samples, and back-side/depth work drive fragment cost. Environment resolution and any intermediate transmission targets set memory pressure. Use an opaque/low-sample fallback on constrained devices instead of hiding the product.

Failure signatures:

- The object looks hollow because thickness and model scale disagree.
- The background shimmers because samples are too low for the current DPR.
- The material turns black when its environment or renderer initialization is missing.

```ts
import { MeshTransmissionNodeMaterial } from "three-blocks/transmission";
```

Examples: https://threejs-blocks.com/examples/webgpu_material_transmission, https://threejs-blocks.com/examples/webgpu_baked_motion_rotation, https://threejs-blocks.com/examples/webgpu_baked_motion_tilt.

## Baked Motion

Turn a rendered camera or timeline sequence into an interactive, depth-aware browser presentation.

Canonical: https://threejs-blocks.com/docs/blocks/baked-motion

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: A controlled timeline, rotation, or tilt-grid interaction should preserve an approved rendered look without shipping the source scene.

Choose something else when: Keep a live mesh for free camera/light/material changes; use VAV for deforming geometry or OAV for individually addressable rigid transforms.

Lifecycle: Load one versioned .utsbv manifest after renderer initialization and retain the poster until ready and frameReady settle. Apply pointer/view/time input, call update(delta), then render the mesh that samples ActiveFrame slots. Resize camera/renderer; the authored camera and bounds stay fixed, so crop rather than extrapolate outside the captured range. Stop input and the animation loop before disposing BakedMotion, its ActiveFrame tracks, and the renderer.

Performance: ActiveFrame wire bytes, decoded slots, dimensions, and frame-change rate dominate. Two-axis interpolation needs more resident slots than a timeline or one-axis rotation. Playback takes the best codec rung the device decodes, so a package stores every width twice; downloads are unaffected, hosting is not.

Failure signatures:

- Pointer motion selects the wrong view when manifest axis order differs from the render order.
- A blank first frame appears when the poster is removed before frameReady.
- Startup rejects when a complete ActiveFrame resource exceeds the configured byte limit.

```ts
import { BakedMotion } from "three-blocks/baked-motion";
```

Examples: https://threejs-blocks.com/examples/webgpu_baked_motion_timeline, https://threejs-blocks.com/examples/webgpu_baked_motion_tilt, https://threejs-blocks.com/examples/webgpu_baked_motion_rotation.

## Object Animation Video

Replay compact authored transforms for many rigid parts while geometry, materials, lighting, and per-object binding remain live.

Canonical: https://threejs-blocks.com/docs/blocks/object-animation-video

Package version: 0.14.0; Classification: curated-block; Status: experimental; Since: Not recorded; Deprecated: No.

Renderer: webgpu/webgl; environments: browser; availability: library; verified: 0.14.0.

Use when: Many rigid objects need authored transform playback while geometry and materials remain live and separately addressable.

Choose something else when: Use VAV for vertex deformation, Baked Motion for captured pixels, or ordinary AnimationMixer for small conventional clips.

Lifecycle: Load the OAV manifest and exact UTSBM transform track, then bind by stable exported names or explicit indices. Advance update(delta) before rendering the bound Object3D or batched instances. Only the normal renderer/camera path resizes; the indexed transform track is immutable asset data. Unbind or restore targets, stop playback, dispose the exact-track reader, then release caller-owned scene objects.

Performance: Object count, indexed-track fetch cadence, and matrix-application count scale the path. Batched targets avoid many scene-object updates when the mapping is stable. Keep one track owner per clip and stop it offscreen.

Failure signatures:

- Strict binding reports names missing from the runtime scene.
- Parts inherit wrong motion when the exported parent graph changed.
- The exact-track reader rejects bytes whose index or quantization contract no longer matches manifest.json.

```ts
import { ObjectAnimationVideo } from "three-blocks/experimental/object-animation-video";
```

Examples: none.

## Vertex Animation Video

Replay stable-topology mesh deformation and optional appearance while material, lighting, and camera response remain live.

Canonical: https://threejs-blocks.com/docs/blocks/vertex-animation-video

Package version: 0.14.0; Classification: curated-block; Status: experimental; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: A deforming mesh must retain live camera/material response while its topology remains stable across an authored clip.

Choose something else when: Use OAV for rigid transforms, Baked Motion for approved pixels, or skeletal/morph animation when its payload and deformation fit.

Lifecycle: Load the VAV manifest, geometry base, exact UTSBM numerical tracks, and any selected UV visual tracks after renderer initialization. Advance mesh.update(delta) before render so geometry and appearance use the same clip time. Resize the renderer/camera only; atlas dimensions and encoded tracks are immutable asset facts. Stop playback, dispose VAVMesh and track streams, then release caller-owned lights/environment and renderer.

Performance: Vertex count, atlas dimensions, numerical-track fetch bandwidth, optional visual-track decode, and interpolation scale cost. Appearance tracks can exceed geometry payload; omit them when live material is sufficient. Bound stream buffers and pause offscreen clips.

Failure signatures:

- Vertices explode when topology or vertex order changes mid-clip.
- Appearance stays static when its per-frame track was not baked or referenced.
- Geometry and appearance drift when manifests from different exports are mixed.

```ts
import { VAVMesh } from "three-blocks/experimental/vertex-animation-video";
import { VAVTrackStream } from "three-blocks/experimental/vertex-animation-video";
```

Examples: https://threejs-blocks.com/examples/webgpu_vav_basic.

## ActiveFrame Video

Decode and synchronize compact GPU-ready animation frames with bounded browser-side resources.

Canonical: https://threejs-blocks.com/docs/blocks/active-frame-video

Package version: 0.14.0; Classification: curated-block; Status: experimental; Since: Not recorded; Deprecated: No.

Renderer: webgpu/webgl; environments: browser, worker; availability: library; verified: 0.14.0.

Use when: Code needs random or weighted access to GPU-ready frames rather than ordinary linear HTML video playback.

Choose something else when: Use HTMLVideoElement for conventional playback or a higher-level Baked Motion/OAV/VAV block when a manifest already owns selection semantics.

Lifecycle: Create AFVideo from one .af source after renderer initialization, await ready, and keep fallback media until firstFrame. Request only changed frame indices/weights before the material samples rgb/alpha nodes, then render. Track dimensions do not resize; update only the consuming geometry/camera and choose an asset tier intentionally. Stop frame requests, dispose AFVideo/decoder slots, then release consuming material and renderer.

Performance: Track resolution, requested frames per interaction, slot count, and decode/upload cadence dominate. Weighted multi-frame sampling increases resident textures and fragment reads. Use lower-resolution tracks and fewer simultaneous slots on mobile.

Failure signatures:

- Colors look wrong when encoded and decoder color spaces disagree.
- The first interaction stalls when readiness is not awaited.
- Frames thrash when pointer events issue decoder work directly instead of coalescing state.

```ts
import { AFVideo } from "three-blocks/experimental/active-frame-video";
import { AFDecoder } from "three-blocks/experimental/active-frame-video";
```

Examples: https://threejs-blocks.com/examples/webgpu_baked_motion_timeline, https://threejs-blocks.com/examples/webgpu_baked_motion_tilt, https://threejs-blocks.com/examples/webgpu_baked_motion_rotation.

## Gaussian Splats

Render and stream captured 3D or animated Gaussian scenes with explicit sorting, memory, and quality controls.

Canonical: https://threejs-blocks.com/docs/blocks/gaussian-splats

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser, worker; availability: library; verified: 0.14.0.

Use when: Captured objects or spaces preserve view-dependent detail that would be expensive or slow to rebuild as a clean production mesh.

Choose something else when: Use a live mesh for topology/material editing or Baked Motion for a tightly controlled approved camera envelope.

Lifecycle: Load static, streaming, or animated manifest data after renderer initialization and keep the capture poster until ready. Update sorting/stream visibility for the current renderer and camera before render; advance animated clips on the same time owner. Resize renderer/camera and re-evaluate visible-density/quality tier; do not silently raise DPR with the same splat budget. Stop streams/clip playback, dispose splat objects and sort/compositor resources, then release renderer-owned targets.

Performance: Visible splat count, sort/tile workload, overdraw, and SH degree drive GPU time. Compressed bytes, cell caches, decode staging, and upload peaks drive memory/network cost. Tier by visible density and capture resolution before removing fallback quality.

Failure signatures:

- Memory grows when stream cells are never evicted.
- Transparency order breaks when update is skipped for the current camera.
- An animated clip is rejected when its base count or manifest encoding disagrees with its tracks.

```ts
import { GaussianSplats } from "three-blocks/gaussian-splats";
import { GaussianSplatsLoader } from "three-blocks/gaussian-splats";
import { GaussianSplatsStream } from "three-blocks/gaussian-splats";
```

Examples: https://threejs-blocks.com/examples/webgpu_gaussiansplat_lit, https://threejs-blocks.com/examples/webgpu_gaussiansplat_4dgs_video, https://threejs-blocks.com/examples/webgpu_gaussiansplat_mesh_to_splat_scene, https://threejs-blocks.com/examples/webgpu_gaussiansplat_mesh_to_splat_lion, https://threejs-blocks.com/examples/webgpu_gaussiansplat_skinned, https://threejs-blocks.com/examples/webgpu_gaussiansplat_voxel_room, https://threejs-blocks.com/examples/webgpu_gaussiansplat_splat, https://threejs-blocks.com/examples/webgpu_gaussiansplat_visualizer, https://threejs-blocks.com/examples/webgpu_points_bvh_volume.

## MSDF Text

Draw crisp spatial or screen-space text from a pre-baked atlas with predictable runtime cost.

Canonical: https://threejs-blocks.com/docs/blocks/msdf-text

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu/webgl; environments: browser; availability: library; verified: 0.14.0.

Use when: The glyph set is known at build time and many crisp spatial or screen-space text items must batch predictably.

Choose something else when: Use runtime SDF text for unknown user/remote glyphs or DOM text when selectable semantic copy does not need 3D placement.

Lifecycle: Load one versioned atlas texture and parse its metrics, then construct MSDFText/BatchedMSDFText after renderer initialization. Change strings/layout only when content changes, call update, then render; move matrices/uniforms without rebuilding glyph geometry. Update viewport/screen offset for screen-space text and preserve readable CSS-equivalent size at each breakpoint. Dispose text batches and caller-owned atlas textures when the shared atlas owner is released.

Performance: Glyph count, atlas size, layout churn, and batch fragmentation drive cost. One shared atlas and BatchedMSDFText reduce draw/material overhead. Cap atlas resolution and inactive capacities before compromising readability.

Failure signatures:

- Missing glyph boxes reveal an incomplete baked charset.
- Text disappears when metrics and atlas image are from different revisions.
- Frame time spikes when text/layout is rebuilt every animation frame.

```ts
import { MSDFText } from "three-blocks/msdf-text";
import { BatchedMSDFText } from "three-blocks/msdf-text";
```

Examples: https://threejs-blocks.com/examples/webgl_text_input, https://threejs-blocks.com/examples/webgpu_text_msdf_batched, https://threejs-blocks.com/examples/webgpu_text_sampler_skinned.

## Runtime SDF Text

Generate glyph distance fields at runtime when text cannot be known ahead of time, accepting its higher setup and memory cost.

Canonical: https://threejs-blocks.com/docs/blocks/runtime-sdf-text

Package version: 0.14.0; Classification: curated-block; Status: experimental; Since: Not recorded; Deprecated: No.

Renderer: webgpu/webgl; environments: browser, worker; availability: library; verified: 0.14.0.

Use when: Text or locales are genuinely unknown until runtime and the application can own asynchronous glyph generation and caching.

Choose something else when: Use MSDF Text for a known production charset or DOM text for ordinary accessible interface copy.

Lifecycle: Create Text, set font/content/layout, and await sync with the initialized renderer before revealing the result. Update transforms/uniforms normally; call sync only after content or layout properties change. Update max width/screen-space placement from layout breakpoints without regenerating unchanged glyphs. Dispose Text and stop any pending content owner before releasing renderer and shared font caches.

Performance: First-use font fetch, glyph generation, atlas growth, and sync frequency dominate. Cache by font/style and avoid unique per-frame strings. Prewarm critical glyphs or choose MSDF for fixed headlines.

Failure signatures:

- First text stalls while a remote font or glyph worker resolves.
- Memory grows when each route creates an isolated glyph cache.
- Important copy becomes inaccessible when no DOM/text alternative exists.

```ts
import { Text } from "three-blocks/experimental/runtime-sdf-text";
import { BatchedText } from "three-blocks/experimental/runtime-sdf-text";
```

Examples: https://threejs-blocks.com/examples/webgpu_text_sampler_skinned.

## GPU Interaction

Publish pointer, kinematic, and collider state once so multiple GPU systems can respond in the same frame.

Canonical: https://threejs-blocks.com/docs/blocks/gpu-interaction

Package version: 0.14.0; Classification: curated-block; Status: experimental; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: Several GPU simulations or render systems need one normalized pointer/collider world, authority, metrics, and update order.

Choose something else when: Keep input local when one small CPU-owned object needs it and no GPU system shares the state.

Lifecycle: Create the system/world, register sources/simulations, then await initialize(renderer) after renderer.init(). Update source targets, await step(renderer, delta), then render every consumer of the shared storage. Update caller-owned coordinate mapping/camera; resize interaction buffers only when capacity/layout requirements change. Stop event producers, dispose/detach sources, then dispose the system after dependent simulations stop.

Performance: Source/collider count, grid resolution, simulation bindings, and readback frequency scale cost. Share one world to avoid duplicate buffers and coordinate transforms. Request metrics readback slowly; never put it in the hot frame path.

Failure signatures:

- Interaction lags one frame when step occurs after render.
- A source affects the wrong system when layer/mask policy is implicit.
- Buffers overflow when authored capacities differ from the runtime sizing report.

```ts
import { GPUInteractionSystem } from "three-blocks/experimental/gpu-interaction";
import { GPUInteractionWorld } from "three-blocks/experimental/gpu-interaction";
import { KinematicInteractionSource } from "three-blocks/experimental/gpu-interaction";
```

Examples: none.

## Surface Sampling

Populate static, skinned, or GPU-deformed surfaces without reading instance transforms back to the CPU.

Canonical: https://threejs-blocks.com/docs/blocks/surface-sampling

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: Large instance transforms must originate on a mesh surface and remain GPU-resident for later culling/rendering.

Choose something else when: Sample on the CPU for small static populations or use authored transforms when exact placement matters more than distribution.

Lifecycle: Create a static/dynamic/BVH sampler after renderer initialization with source geometry and target count. Recompute only when the source surface changes; pass output storage directly to culling/material consumers before render. No viewport resize is required; update only source transforms/bounds that change sampling space. Stop dependent consumers before disposing sampler/output storage and caller-owned source geometry.

Performance: Source vertex/triangle count, target count, dynamic area rebuild, and dispatch count scale work. Readback destroys the intended GPU-resident path. Reuse output buffers and reduce resample frequency on mobile.

Failure signatures:

- All samples collapse when dynamic storage was not initialized from source positions.
- Orientation is wrong when stale vertex normals are used for a deforming surface.
- Performance collapses when results are read back and uploaded again.

```ts
import { ComputeMeshSurfaceSampler } from "three-blocks/surface-sampling";
import { ComputeMeshDynamicSurfaceSampler } from "three-blocks/surface-sampling";
import { ComputeBVHSampler } from "three-blocks/surface-sampling";
```

Examples: https://threejs-blocks.com/examples/webgpu_text_sampler_skinned, https://threejs-blocks.com/examples/webgpu_simulation_boids_3d, https://threejs-blocks.com/examples/webgpu_simulation_sph_3d.

## Instance Culling

Cull large instance sets on the GPU before shading and drawing the visible survivors.

Canonical: https://threejs-blocks.com/docs/blocks/instance-culling

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: A GPU-resident instance population is much larger than the camera can show and survivors must feed indirect rendering.

Choose something else when: Use ordinary frustum culling for small CPU-owned object sets or when per-instance bounds cannot be represented safely.

Lifecycle: Attach mesh/geometry, reference transforms, bounds, and renderer after initialization; build storage before the first update. Set camera uniforms, run update, then render the material that resolves survivor indices and source transforms. Refresh camera projection/aspect and any orthographic scale; storage capacity changes require explicit reallocation. Stop consuming materials/batches, then dispose culling buffers, GUI/readback hooks, and caller-owned geometry.

Performance: Instance count, bound tests, sort mode, and dispatch/synchronization count drive compute. Conservative bounds trade extra fragments for correctness. Avoid survivor readback in the render loop.

Failure signatures:

- Instances pop because bounds are too small or stale.
- Colors/motion belong to another instance when survivor IDs are not used in the material.
- One-frame lag appears when camera uniforms update after culling.

```ts
import { ComputeInstanceCulling } from "three-blocks/instance-culling";
```

Examples: https://threejs-blocks.com/examples/webgpu_simulation_boids_3d, https://threejs-blocks.com/examples/webgpu_simulation_sph_3d.

## Smoke

Build pointer-reactive 2D or volumetric smoke with an explicit simulation and compositing quality ladder.

Canonical: https://threejs-blocks.com/docs/blocks/smoke

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu/webgl; environments: browser; availability: library; verified: 0.14.0.

Use when: Atmosphere must occupy a 3D volume, react to forces/objects, and composite with scene depth rather than behave as a flat overlay.

Choose something else when: Use a TSL/post effect for screen-space atmosphere or particles when a volumetric pressure/density field is unnecessary.

Lifecycle: Choose a quality tier, create/initialize SmokeVolume after renderer.init(), then configure render caches/material/compositor. Queue splats from input, step interaction then smoke compute, refresh caches as configured, and render/composite last. Scale renderer/compositor targets with viewport tier; simulation grid changes require explicit reallocation rather than every resize. Stop input/loop, dispose compositor/material, then smoke textures/compute resources and interaction world in owner order.

Performance: 3D grid resolution, pressure iterations/solver, advection correction, turbulence, light steps, and compositor pixels multiply cost. Volume textures and multigrid intermediates set the memory floor. Reduce grid/cache resolution and update frequency together on mobile.

Failure signatures:

- The volume fills uniformly when dissipation/source balance is wrong.
- Pointer gusts spike after re-entry when event deltas are not bounded.
- A one-frame visual lag appears when simulation runs after compositing.

```ts
import { SmokeVolume } from "three-blocks/smoke";
import { VolumeSmokeNodeMaterial } from "three-blocks/smoke";
import { smoke } from "three-blocks/smoke";
```

Examples: https://threejs-blocks.com/examples/webgl_postprocessing_smoke, https://threejs-blocks.com/examples/webgpu_simulation_smoke_3d.

## Water

Simulate and render interactive water from particle volume through surface or raymarched presentation.

Canonical: https://threejs-blocks.com/docs/blocks/water

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: A liquid needs particle/grid motion, a reconstructed surface, foam/whitewater, and live interaction rather than a shader-only plane.

Choose something else when: Use OceanWaves/WaterNodeMaterial for a surface-only ocean or PBF/SPH when their particle behavior fits without MPM reconstruction.

Lifecycle: Choose capacity/grid/domain/preset, construct WaterVolume after renderer.init(), then select surface or raymarch renderer/material. Apply interaction/forces, step WaterVolume before the surface renderer/material is consumed, then render. Resize camera/renderer and surface targets; keep grid/domain resolution fixed to an explicit quality tier. Stop the loop, dispose surface renderer/material, then water solver/fields/foam and renderer resources.

Performance: Particle capacity, grid cells, solver passes, surface reconstruction, foam, and raymarch resolution dominate. Reduce particle, grid, reconstruction, foam, and raymarch work as one named quality tier. Validate the chosen quality tier on representative target devices with the final renderer size, DPR, population, interaction, and fallback enabled.

Failure signatures:

- Particles escape or explode when domain/grid/material preset disagree.
- The surface lags when solver steps after reconstruction.
- Mobile cost stays high when only particle count changes but full-resolution reconstruction remains.

```ts
import { WaterVolume } from "three-blocks/water";
import { WaterNodeMaterial } from "three-blocks/water";
import { WaterSurfaceRenderer } from "three-blocks/water";
import { WaterRayMarchRenderer } from "three-blocks/water";
```

Examples: https://threejs-blocks.com/examples/webgpu_simulation_water_ocean, https://threejs-blocks.com/examples/webgpu_simulation_water_compute, https://threejs-blocks.com/examples/webgpu_simulation_water_surface.

## Material Point Method

Build custom particle-grid simulations with explicit material models, forces, seeding, diagnostics, and render mirrors.

Canonical: https://threejs-blocks.com/docs/blocks/mpm

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: A particle-grid simulation needs a custom material response, force/collider hooks, diagnostics, or render mirror beyond the higher-level Water product.

Choose something else when: Use Water for a production liquid surface, PBF for constraint-driven incompressibility, or SPH for direct pressure-force behavior.

Lifecycle: Create MPMSolver with one material model and fixed capacity/grid options after renderer initialization, then seed its active particle prefix with a TSL initializer. Apply caller-owned inputs, call solver.step(renderer, delta) before any render mirror consumes particleBuffer, then render. Viewport changes affect only the caller-owned camera and render mirror; capacity, grid, and material layout changes require an explicit solver rebuild. Stop the frame loop and dependent render/readback work, dispose the solver, then release caller-owned geometry, materials, and renderer resources.

Performance: Particle capacity, active count, grid-cell count, formulation, substeps, sorting, diagnostics, and render-mirror cost are the primary axes. Keep particle state GPU-resident and read diagnostics only at a bounded cadence. Reduce solver and render-mirror tiers together so a cheaper simulation does not retain an expensive presentation path.

Failure signatures:

- Particles collapse or explode when material constants, grid scale, and delta are tuned independently.
- Rendering lags one frame when the mirror runs before solver.step().
- Memory stays high when particle count changes but allocated capacity and grid size do not.

```ts
import { MPMSolver } from "three-blocks/mpm";
```

Examples: https://threejs-blocks.com/examples/webgpu_sdf_body_tracking.

## Boids

Simulate flocking in two or three dimensions with spatial-grid acceleration and optional volume constraints.

Canonical: https://threejs-blocks.com/docs/blocks/boids

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: Many agents need art-directed flocking, bounded motion, optional spatial acceleration, and GPU-resident transforms.

Choose something else when: Use authored animation for predetermined paths or a particle solver when collision/material behavior matters more than steering.

Lifecycle: Create Boids after renderer initialization with count/domain and optional grid/constraint/interaction policy. Update interaction, await boids.step(renderer, delta), then render the mesh/material consuming its instance matrix. Only camera/renderer resize; update domain dimensions when the world volume—not viewport—changes. Stop the loop, detach/dispose spatial grid and constraints/interaction owner, then release render resources.

Performance: Agent count, neighbor-query path, grid rebuild, substeps, and render geometry scale cost. Enable the spatial grid only above the measured crossover. Use simple geometry/impostors for dense distant flocks.

Failure signatures:

- Flocks clump or explode when steering values are not scaled to domain/time step.
- Grid acceleration regresses small counts.
- Motion jumps when a long hidden-tab delta exceeds the substep policy.

```ts
import { Boids } from "three-blocks/boids";
```

Examples: https://threejs-blocks.com/examples/webgpu_simulation_boids_3d.

## Position-Based Fluids

Model interactive incompressible particles with iterative positional constraints and predictable iteration controls.

Canonical: https://threejs-blocks.com/docs/blocks/pbf

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: A particle fluid needs stable incompressibility and controllable constraints with a clear iteration-based quality ladder.

Choose something else when: Choose SPH for force/pressure behavior or MPM/Water for grid-mediated material response and surface reconstruction.

Lifecycle: Create PBF after renderer initialization with count/domain/material/neighbor policy and optional interaction/constraints. Update input/constraints, await step(renderer, delta), then render its GPU buffers through geometry or impostors. Resize only renderer/camera; change particle/domain capacity through an explicit rebuild/quality-tier transition. Stop loop, dispose render/culling material, then PBF/grid/constraints and renderer resources.

Performance: Particle count, neighbor density, solver iterations, substeps, grid updates, and render path multiply cost. Reusing a spatial grid helps only after its build cost is amortized. Pair lower count/iterations with impostor and DPR tiers.

Failure signatures:

- Fluid compresses when iterations/rest-density calibration is too weak.
- Particles jitter when time step and smoothing radius disagree.
- Render cost remains high after solver reduction because geometry/DPR was not tiered.

```ts
import { PBF } from "three-blocks/pbf";
```

Examples: https://threejs-blocks.com/examples/webgpu_material_transmission, https://threejs-blocks.com/examples/webgpu_simulation_sph_3d.

## Smoothed Particle Hydrodynamics

Model pressure-driven particle fluids when force behavior matters more than PBF-style constraint convergence.

Canonical: https://threejs-blocks.com/docs/blocks/sph

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: A particle fluid needs explicit pressure/viscosity forces and force-driven material tuning rather than positional constraint correction.

Choose something else when: Use PBF for constraint-stable incompressibility or MPM/Water for grid transfer and deformable/material behavior.

Lifecycle: Create SPH after renderer initialization with domain/material/time-step and optional grid/interaction/constraint policy. Update forces/interaction, await step(renderer, delta), then render particle buffers. Resize only camera/renderer; rebuild capacity/domain only during a named tier change. Stop the loop, dispose render path, then SPH/grid/constraints and renderer.

Performance: Particle count, neighbor queries, force passes, time-step substeps, and render path dominate. Grid acceleration has a count/distribution crossover that must be measured. Lower count and visual resolution together for mobile.

Failure signatures:

- Pressure explodes when mass/radius/rest-density calibration is inconsistent.
- Long frame deltas destabilize integration when substeps are unbounded or absent.
- A grid adds cost without benefit for sparse small populations.

```ts
import { SPH } from "three-blocks/sph";
```

Examples: https://threejs-blocks.com/examples/webgpu_simulation_sph_3d.

## SDF and raymarching

Build GPU-readable signed-distance fields for constraints, sampling, and raymarched surfaces or volumes — including live per-frame fields rebuilt from skinned characters.

Canonical: https://threejs-blocks.com/docs/blocks/sdf-raymarching

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: Many GPU queries need a stable signed field, a volume must be rendered/constrained from one sampled representation, or a moving skinned character must become a collider its consumers can read in one fetch.

Choose something else when: Use BVH queries for sparse precise surface work or live mesh rendering when a sampled field loses required thin detail.

Lifecycle: Build/obtain a BVH, generate the SDF after renderer initialization, then pass the texture to raymarch material or constraints. For a live skinned field, construct SkinnedMeshSDF from an indexed skinned mesh with a bound skeleton; no GPU work runs until the first dispatch. Regenerate only when source geometry/bounds change; sample or raymarch the existing texture before render. A live skinned field is the exception: pose the skeleton, then update() and dispatch() it every frame before its consumers step. Viewport resize affects raymarch screen cost, not field resolution; rebuild field only through an explicit quality/source change. Stop consumers, dispose material/constraints, then generator/3D texture and source geometry/BVH owner.

Performance: Voxel count grows cubically with resolution; generation work follows geometry/BVH and grid size. Raymarch steps and screen coverage dominate rendering. Prefer stable fields and lower mobile resolution; avoid per-frame regeneration. A live skinned field rebuilds in fourteen compute passes and amortizes across every query, so it pays off where queries greatly outnumber pixels; a measured example is on the block page with its device and date. Consumers of a live skinned field cost one trilinear texture fetch per query, independent of triangle count.

Failure signatures:

- Thin features disappear when voxel resolution or margin is insufficient.
- Normals/constraints jump when bounds transforms disagree.
- Frame time collapses when the field is rebuilt for unchanged geometry.
- A live skinned field is empty or lags when the skeleton is posed after update() instead of before it.
- Sampling a live field's texture directly past a domain face repeats that face's data; the block's own samplers guard it, a direct binding must clip its own reads.

```ts
import { ComputeSDFGenerator } from "three-blocks/sdf-raymarching";
import { RayMarchSDFNodeMaterial } from "three-blocks/sdf-raymarching";
import { BVHVolumeConstraint } from "three-blocks/sdf-raymarching";
import { SDFVolumeConstraint } from "three-blocks/sdf-raymarching";
import { SkinnedMeshSDF } from "three-blocks/sdf-raymarching";
```

Examples: https://threejs-blocks.com/examples/webgpu_points_bvh_volume, https://threejs-blocks.com/examples/webgpu_sdf_body_tracking, https://threejs-blocks.com/examples/webgpu_simulation_boids_3d, https://threejs-blocks.com/examples/webgpu_simulation_smoke_3d, https://threejs-blocks.com/examples/webgpu_simulation_sph_3d.

## Sphere impostors

Shade one-triangle particle impostors as lit spheres when hardware sphere geometry would dominate vertex cost.

Canonical: https://threejs-blocks.com/docs/blocks/sphere-impostors

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: Dense spheres/particles are vertex-bound and their projected size/overdraw keeps analytic sphere shading cheaper than tessellated geometry.

Choose something else when: Use hardware sphere geometry for close, large, low-count particles or when exact mesh silhouette/shadow behavior is required.

Lifecycle: Create SphereImpostorNodeMaterial after renderer initialization and connect GPU position/radius nodes to triangle/instance geometry. Update particle storage/culling before render; keep sphere depth and lighting nodes stable. Resize renderer/camera and reconsider the tier when projected particle size or DPR changes. Stop simulation/culling, dispose impostor material/geometry, then release shared particle storage.

Performance: Particle count, projected pixel area, overlap/overdraw, depth writes, and lighting dominate. Use hardware geometry when close or overlapping impostors become fragment-bound. Validate the chosen quality tier on representative target devices with the final renderer size, DPR, population, interaction, and fallback enabled.

Failure signatures:

- Large close particles become fragment-bound through overdraw.
- Edges reveal billboards when depth/AA settings are wrong.
- Lighting or shadows disagree when the analytic normal/depth path is not used consistently.

```ts
import { SphereImpostorNodeMaterial } from "three-blocks/sphere-impostors";
import { sphereImpostorPosition } from "three-blocks/sphere-impostors";
```

Examples: https://threejs-blocks.com/examples/webgpu_sdf_body_tracking, https://threejs-blocks.com/examples/webgpu_simulation_sph_3d, https://threejs-blocks.com/examples/webgpu_simulation_water_compute, https://threejs-blocks.com/examples/webgpu_simulation_water_surface.

## Pristine grid

Add an infinite anti-aliased reference grid with two independently styled world-space layers.

Canonical: https://threejs-blocks.com/docs/blocks/grid-pristine

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu/webgl; environments: browser; availability: library; verified: 0.14.0.

Use when: Editors, simulation previews, product staging, or technical scenes need a stable world-space scale reference.

Choose something else when: Use authored floor geometry when the ground needs texture detail, collision, displacement, or an irregular boundary.

Lifecycle: Create GridPristine with major and minor cell styles, then add it to the scene in the desired reference plane. Render normally; update only the public uniform values whose visual style changes. Resize the renderer and camera normally, then recheck line widths at the resulting DPR and camera distance. Remove the grid and call dispose() to release its geometry, material, and optional GUI folder.

Performance: The grid is one analytical mesh with no texture payload. Fragment cost follows covered pixels and DPR. Reduce minor-layer opacity or hide the grid when it no longer communicates scale.

Failure signatures:

- Minor lines shimmer when their width is too small for the target DPR.
- The grid reads at the wrong scale when scene units are inconsistent.
- The floor disappears when its colors and opacity have insufficient background contrast.

```ts
import { GridPristine } from "three-blocks/grid-pristine";
```

Examples: https://threejs-blocks.com/examples/webgpu_gaussiansplat_visualizer, https://threejs-blocks.com/examples/webgpu_installation_planner.

## Core TSL effects

Compose reusable film, painterly, Fresnel, parallax, projection, and noise treatments inside Three.js node materials and post passes.

Canonical: https://threejs-blocks.com/docs/blocks/core-tsl-effects

Package version: 0.14.0; Classification: curated-block; Status: stable; Since: Not recorded; Deprecated: No.

Renderer: webgpu/webgl; environments: browser; availability: library; verified: 0.14.0.

Use when: A reusable art-directed material/post effect can be expressed as typed node composition with explicit coordinate and render-stage inputs.

Choose something else when: Use a volume/geometry block when the effect needs real spatial state, or a simple material property when a custom graph adds no visible value.

Lifecycle: Compose the selected factory/node once after renderer setup and attach it to the documented material or post-processing slot. Update uniforms/nodes, not graph structure, before render or the owning post pass. Resize post targets and any screen-space texel inputs; material-space nodes need no viewport rebuild. Stop post loop, dispose post targets/materials/textures, then renderer resources.

Performance: Screen coverage, texture reads, samples/kernel radius, branches, and overlapping post passes drive cost. Graph rebuilds trigger shader compilation; uniforms do not. Disable or simplify expensive passes for reduced/mobile tiers.

Failure signatures:

- The effect moves in the wrong space.
- Shader recompiles occur because the graph is rebuilt during interaction.
- A post node samples stale or wrong-resolution targets after resize.

```ts
import { filmHD } from "three-blocks/core-tsl-effects";
import { kuwahara } from "three-blocks/core-tsl-effects";
import { fresnel } from "three-blocks/core-tsl-effects";
import { parallaxOcclusion } from "three-blocks/core-tsl-effects";
import { biplanarTexture } from "three-blocks/core-tsl-effects";
```

Examples: https://threejs-blocks.com/examples/webgpu_simulation_sph_3d, https://threejs-blocks.com/examples/webgpu_text_sampler_skinned.

## Compute foundations

Use sorting, prefix sums, batching, and GPU-generated geometry as the data-moving foundation for larger blocks.

Canonical: https://threejs-blocks.com/docs/blocks/compute-foundations

Package version: 0.14.0; Classification: curated-block; Status: experimental; Since: Not recorded; Deprecated: No.

Renderer: webgpu; environments: browser; availability: library; verified: 0.14.0.

Use when: A higher-level block needs deterministic GPU prefix sums, sorting, batching, readback, or resource-disposal primitives.

Choose something else when: Stay on a curated product block when it already owns these passes; do not assemble low-level compute solely to avoid its lifecycle contract.

Lifecycle: Allocate typed storage after renderer initialization, create the primitive with fixed capacity/options, and validate device limits. Write producers, run prefix/sort/batch compute in dependency order, then let culling/render consumers read the result. Viewport changes do not resize compute buffers; capacity/type changes require an explicit rebuild. Stop consumers/readbacks, dispose compute primitives and owned storage, then renderer.

Performance: Element count, pass count, workgroup shape, synchronization, and readback frequency dominate. Keep diagnostic readback asynchronous and outside the frame loop. Validate the chosen quality tier on representative target devices with the final renderer size, DPR, population, interaction, and fallback enabled.

Failure signatures:

- Consumers read stale data when pass order is implicit.
- Capacity overflow corrupts indirect or sort output.
- Frame stalls appear when diagnostic readback becomes synchronous/hot.

```ts
import { ComputeRadixSort } from "three-blocks/experimental/compute-foundations";
import { ComputePrefixSum } from "three-blocks/experimental/compute-foundations";
import { ComputeBitonicSort } from "three-blocks/experimental/compute-foundations";
```

Examples: none.

