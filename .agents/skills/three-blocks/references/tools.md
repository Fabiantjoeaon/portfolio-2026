# Authoring tool contracts

6 authoring tools. Runtime imports stay public package imports; the tools produce the assets blocks consume.

## Devtools

Watch a Three Blocks app while you develop, and prepare shaders, text atlases, environment lighting, and GPU-compressed assets ahead of production.

Canonical: https://threejs-blocks.com/docs/tools/devtools

Delivery: cli; access: free; platforms: macOS, Windows, Linux, browser; verified against: @three-blocks/devtools 0.1.0.

Install and activation:

```sh
npx three-blocks status
npx three-blocks shaders
npx three-blocks doctor
```

- **Add the plugin and register the renderer:** Add threeBlocks() to a Vite app, then call registerDevtools({ renderer }) where the app creates its page-owned WebGPURenderer.
- **Register shader keys:** Register each material, render pipeline, compute node, or shared-node container under a stable semantic key.
- **Capture the current scene:** After shader inputs settle, click Capture in the development overlay. Use the driven CLI capture only for route batches and automated regeneration; the CLI capture also compresses public GLB and HDR assets to meshopt + KTX2.
- **Optimize assets:** Compress any GLB, texture, or HDR environment to meshopt + KTX2 (BC6H-ready HDR) with exact download and VRAM accounting; the CLI capture keeps public GLB and HDR sources optimized automatically. Command: `npx three-blocks optimize`.
- **Check freshness:** Verify every configured scene without launching a browser or GPU; stale state exits non-zero with the exact recovery command. Command: `npx three-blocks shaders`.
- **Verify the release:** Prove zero registered live builds and pixel parity, then run the strict Vite build to reject stale artifacts. Command: `npx three-blocks shaders test`.

Outputs: versioned WebGPU shader manifests, live-versus-precompiled parity evidence, development overlay, MSDF atlas, metrics, browser-font copy, and receipt, prefiltered environment KTX2, meshopt + KTX2 optimized GLB, texture, and HDR assets with a freshness receipt.

- The runtime face is three-blocks/devtools plus the Vite plugin; the command face is npx three-blocks.
- Shader capture, parity, smoke checks, and environment baking run in Node.js with native WebGL and WebGPU; no browser installation is needed.
- Devtools supports WebGPURenderer and rejects WebGLRenderer; rejected or stale shader entries compile live.
- A current capture can report project-specific TSL build time saved; a shader-relevant edit makes that timing unavailable until the next capture.
- On Three.js r185, every bundler adapter applies the same in-memory compatibility transform: #34068 captures node builders, #34069 stabilizes buffer labels, #34070 hydrates builder state, and the local compileAsync patch batches pipeline waits while balancing WebGPU error scopes.
- The r185 transform never writes node_modules. Current captures require precompiled manifest version 3; recapture older artifacts instead of editing generated files.
- The Vite plugin removes the devtools runtime from production bundles; production-aware bundlers select an import-free no-op, with the NODE_ENV guard as a condition-less fallback.
- Text generation writes each configured browser-font copy, compressed .msdf.ktx2 atlas, .msdf.json metrics, and receipt under public/.
- Environment bake writes a compressed, prefiltered KTX2 cube that loads without runtime PMREM generation.
- Asset optimization rewrites GLB geometry with meshopt, encodes textures slot-aware to Basis Universal KTX2, converts HDR environments to UASTC HDR that transcodes to BC6H on capable GPUs, and records exact per-mip VRAM math in .three-blocks/assets/meta.json.

Troubleshooting:

- **The overlay reports live shaders.** Run `npx three-blocks shaders`, register any missing keys, and capture the changed scene from the overlay.
- **Capture cannot initialize the renderer on a new machine.** Use Node.js 22.12 or newer, install the project's dependencies including native bindings, and confirm that the machine supports the selected WebGL or WebGPU backend.
- **The Stats toggle does not open panels.** Install the optional panel dependency with `bun add -d stats-gl`.
- **Every artifact becomes stale after an upgrade.** Run `npx three-blocks shaders capture` once because captures pin the runtime that produced them.
- **The overlay reports unoptimized or stale assets.** Run `npx three-blocks shaders capture` (it optimizes public GLB and HDR sources automatically) or `npx three-blocks optimize` for a specific file, then check with `npx three-blocks assets status`.
- **The app uses WebGLRenderer.** Keep the app on live shader compilation; WebGLRenderer is outside the devtools contract.

Consumed by: https://threejs-blocks.com/docs/blocks/msdf-text.

## Three Blocks CLI

Authenticate, diagnose a project, inspect available tools, and install supported authoring integrations.

Canonical: https://threejs-blocks.com/docs/tools/three-blocks-cli

Delivery: cli; access: free; platforms: macOS, Windows, Linux; verified against: Three Blocks Blender hub 0.3.3.

Install and activation:

```sh
npm install three-blocks
npx three-blocks doctor
npx three-blocks install blender
```

- **Install the public CLI:** The three-blocks package owns the CLI, so the project and its diagnostics use the same pinned version. Command: `npm install three-blocks`.
- **Inspect the project:** Status and doctor report package, project, credential, Blender-hub, and optional splat-engine state before changing assets. Command: `npx three-blocks doctor`.
- **Connect an authoring seat when needed:** Login uses the device or token flow; the free starter, status, shader, text, and Blender-hub commands do not become Pro runtime dependencies. Command: `npx three-blocks login`.
- **Run or install the selected workflow:** List the entitled tool bundle or install the free Blender hub, then follow the canonical page for the generated artifact. Command: `npx three-blocks tools --help`.

Outputs: project diagnostics, authoring-tool installations.

- doctor is diagnostic: it reports project, credential, Blender hub, and splat-engine state without rewriting source assets.
- install blender targets discovered Blender configuration directories; --zip writes an addon archive for manual installation.
- Text commands generate an atlas and metadata consumed by the public MSDF runtime rather than browser-generated glyph geometry.

Troubleshooting:

- **The CLI reports that the project or package cannot be found.** Run it from the project root after installing the pinned three-blocks package, then repeat `npx three-blocks doctor`.
- **A Pro tool is unavailable or the credential is rejected.** Run `npx three-blocks login`, confirm the seat in `npx three-blocks doctor`, and use `--update` only when the cached bundle is stale.

Consumed by: .

## Baked Motion Video

Convert Blender timeline, tilt-grid, or rotation renders into whole-file ActiveFrame packages.

Canonical: https://threejs-blocks.com/docs/tools/baked-motion-video

Delivery: cli-and-blender; access: pro-seat; platforms: macOS, Windows, Linux, Blender; verified against: Baked Motion Blender addon 1.5.2.

Install and activation:

```sh
npx three-blocks login
npx three-blocks install blender
npx three-blocks doctor
npx three-blocks tools utsbv --help
```

- **Author the camera array:** In Blender, choose a timeline, rotation, or two-axis tilt grid and lock camera, bounds, resolution, and frame order before rendering.
- **Render synchronized channels:** The Blender addon writes the color frames and optional linear depth frames from the same camera samples.
- **Encode the package:** The entitled UTSBV tool writes verified ActiveFrame resources for every motion mode, emitting each rendition width once per codec rung. Command: `npx three-blocks tools utsbv --help`.
- **Load the browser runtime:** BakedMotion fetches each ActiveFrame resource once, admits its media, then exposes timeline, pointer, or view controls according to the authored mode.

Outputs: .utsbv manifest, .af media tracks, depth and albedo data.

- A .utsbv contains synchronized ActiveFrame media resources for timeline, tilt, and rotation modes.
- A .utsbv indexes every stream into hashed byte-range segments so playback admits only the views the current sample needs.
- The manifest records mode, axes, frame order, camera, bounds, dimensions, hashes, and frame indexes.
- The runtime validates whole-file resource hashes, dimensions, and ActiveFrame indexes before readiness.

Troubleshooting:

- **Pointer or view motion selects the wrong frame.** Compare the manifest mode, axis ranges, frame order, and Blender sample order before changing runtime interpolation.
- **The package loads but a track is rejected.** Re-encode color and depth together; their frame counts and dimensions must match the manifest and each other.

Consumed by: https://threejs-blocks.com/docs/blocks/baked-motion, https://threejs-blocks.com/docs/blocks/active-frame-video.

## Object Animation Video exporter

Encode named rigid-object transforms into exact binary OAV packages.

Canonical: https://threejs-blocks.com/docs/tools/object-animation-video

Delivery: cli-and-blender; access: pro-seat; platforms: macOS, Windows, Linux, Blender; verified against: Object Animation Video Blender addon 1.0.1.

Install and activation:

```sh
npx three-blocks login
npx three-blocks install blender
npx three-blocks doctor
npx three-blocks tools oav --help
```

- **Select rigid objects:** Choose the Blender objects whose affine transforms need playback and preserve stable names and parent relationships.
- **Bake object transforms:** The addon samples twelve affine components per object per frame in Three.js Y-up coordinates.
- **Encode the OAV folder:** The entitled OAV tool quantizes twelve affine components once, writes one exact UTSBM track, verifies the post-quantization round trip, and commits the package atomically. Command: `npx three-blocks tools oav --help`.
- **Bind runtime objects:** ObjectAnimationVideo loads manifest.json, binds by stable object name or index, and applies the decoded matrices during update.

Outputs: OAV manifest, UTSBM transform track, machine-readable build report.

- OAV schema 2 is the current public format and stores twelve 12-bit affine lanes in one exact UTSBM indexed-meshopt track.
- The runtime reconstructs typed matrix arrays from the binary track; Three.js uploads changed object, instance, or batch matrix buffers to the GPU.
- Every build report fingerprints the encoder and separates transfer, CPU memory, upload, and GPU residency instead of inferring decoder surfaces from package bytes.

Troubleshooting:

- **A scene object is not animated after binding.** Compare its exported name or explicit index with the manifest object table; use strict binding to surface every missing object.
- **Transforms jump or inherit the wrong parent motion.** Preserve the exported hierarchy and Three.js Y-up conversion, then regenerate the whole manifest and track together.

Consumed by: https://threejs-blocks.com/docs/blocks/object-animation-video.

## Vertex Animation Video exporter

Encode deforming vertex positions, normals, and appearance into exact binary VAV packages.

Canonical: https://threejs-blocks.com/docs/tools/vertex-animation-video

Delivery: cli-and-blender; access: pro-seat; platforms: macOS, Windows, Linux, Blender; verified against: Vertex Animation Video Blender addon 1.4.1.

Install and activation:

```sh
npx three-blocks login
npx three-blocks install blender
npx three-blocks doctor
npx three-blocks tools vav --help
```

- **Prepare one deforming mesh:** Keep vertex topology and UV layout stable across the clip; record the intended frame range and frame rate.
- **Bake Blender interchange:** The VAV addon samples positions, normals, and optional UV-space appearance into a .vavbake interchange file.
- **Encode geometry and appearance:** The VAV encoder writes exact UTSBM numerical tracks. Optional UV-space visual appearance remains media; the distributed tools bundle owns the production encoder and its dependencies. Command: `npx three-blocks tools vav --help`.
- **Load and update VAVMesh:** The browser runtime loads the manifest, allocates the vertex atlas, and advances geometry and appearance from the same clip time.

Outputs: VAV manifest, UTSBM numerical tracks, optional UV visual media tracks, machine-readable build report.

- The .vavbake interchange preserves stable topology, frame timing, quantization bounds, and optional UV-space appearance inputs.
- VAV schema 2 is the current public format and stores geometry and per-vertex appearance in exact UTSBM indexed-meshopt tracks.
- The runtime copies decoded atlas bytes into persistent R8 DataTextures; setting needsUpdate lets Three.js upload those arrays before the shader samples them.
- UV-space appearance remains a visual media track, so its decoder census is separate from numerical geometry and per-vertex appearance.
- Manifest timing, topology, quantization, and atlas dimensions are one runtime contract; regenerate related tracks together when any changes.

Troubleshooting:

- **Geometry animates but appearance remains static.** Verify that the Blender bake contains per-frame UV-space appearance and that the encoded manifest references the matching appearance tracks.
- **Vertices explode or normals flicker.** Confirm topology and vertex order stay stable for the full frame range, then re-bake before changing runtime decoding.

Consumed by: https://threejs-blocks.com/docs/blocks/vertex-animation-video.

## Gaussian splat pipelines

Capture a Blender still or timeline as a static Gaussian asset or validated 4DGS clip.

Canonical: https://threejs-blocks.com/docs/tools/gaussian-splat-pipeline

Delivery: cli-and-blender; access: pro-seat; platforms: macOS, Windows, Linux, Blender; verified against: Mesh to Splat Blender addon 0.2.9.

Install and activation:

```sh
npx three-blocks login
npx three-blocks install splat-engine
npx three-blocks doctor
npx three-blocks tools splat --help
```

- **Choose Still or Animation:** In Blender, Still captures the current frame. Animation uses the scene frame range, frame step, and frame rate. The CLI selects the same path with `--animation`.
- **Install the native engine when needed:** The managed engine bundle contains the static Brush trainer and brush-spacetime. An older static-only cache updates automatically when an animation run starts. Command: `npx three-blocks install splat-engine`.
- **Run the one-shot capture:** A still writes stable-ID PLY and SOG assets. Animation locks one camera rig over the full motion bounds, samples one barycentric identity table, trains every frame, and writes a gzip .b4dgs plus validation report. Command: `npx three-blocks tools splat --help`.
- **Deliver the matching runtime asset:** GaussianSplats loads static PLY/SOG data. Convert the validated .b4dgs interchange to a SplatClip video tier before browser delivery when you need the animated runtime path.

Outputs: .ply, .sids, .sog, .b4dgs, .b4dgs.json.

- 4D capture requires stable object and mesh topology, but it does not reuse area-weighted indices independently per frame: one canonical triangle/barycentric plan follows the deforming surface.
- Position, scale, opacity, rotation, and color are measured independently. Only attributes invariant within half a quantization step are stored once.
- The encoder decodes the serialized container against every source PLY and deletes the candidate when any group exceeds its quantization bound.

Troubleshooting:

- **The splat command cannot start its engine.** Run `npx three-blocks install splat-engine`, then `npx three-blocks doctor`; use `--update` only after the installed capability is reported stale.
- **An animated clip is rejected or shows unstable motion.** Keep the animated mesh topology stable, update the Splat Engine for brush-spacetime, and treat a quantization or static-attribute rejection as an authoring failure instead of bypassing the gate.

Consumed by: https://threejs-blocks.com/docs/blocks/gaussian-splats.

