# Public API index

906 public symbols across 37 entry points, with deprecation status where applicable. Exact signatures: https://threejs-blocks.com/docs/raw/api/<symbol-slug> or https://threejs-blocks.com/llms-full.txt.

- `three-blocks`: 16 exported symbols — The curated core barrel: stable block facades and shared types for app code. Platform machinery and experimental work ship on named subpaths, not here.
- `three-blocks/msdf-text`: 13 exported symbols — Draw crisp spatial or screen-space text from a pre-baked atlas with predictable runtime cost.
- `three-blocks/surface-sampling`: 13 exported symbols — Populate static, skinned, or GPU-deformed surfaces without reading instance transforms back to the CPU.
- `three-blocks/instance-culling`: 13 exported symbols — Cull large instance sets on the GPU before shading and drawing the visible survivors.
- `three-blocks/boids`: 5 exported symbols — Simulate flocking in two or three dimensions with spatial-grid acceleration and optional volume constraints.
- `three-blocks/pbf`: 25 exported symbols — Model interactive incompressible particles with iterative positional constraints and predictable iteration controls.
- `three-blocks/sph`: 28 exported symbols — Model pressure-driven particle fluids when force behavior matters more than PBF-style constraint convergence.
- `three-blocks/mpm`: 45 exported symbols — Build custom particle-grid simulations with explicit material models, forces, seeding, diagnostics, and render mirrors.
- `three-blocks/sphere-impostors`: 11 exported symbols — Shade one-triangle particle impostors as lit spheres when hardware sphere geometry would dominate vertex cost.
- `three-blocks/grid-pristine`: 1 exported symbols — Add an infinite anti-aliased reference grid with two independently styled world-space layers.
- `three-blocks/core-tsl-effects`: 7 exported symbols — Compose reusable film, painterly, Fresnel, parallax, projection, and noise treatments inside Three.js node materials and post passes.
- `three-blocks/transmission`: 5 exported symbols — Render controllable refractive depth for glass and translucent product surfaces with an explicit quality cost.
- `three-blocks/baked-motion`: 25 exported symbols — Turn a rendered camera or timeline sequence into an interactive, depth-aware browser presentation.
- `three-blocks/experimental/object-animation-video`: 26 exported symbols — Replay compact authored transforms for many rigid parts while geometry, materials, lighting, and per-object binding remain live.
- `three-blocks/experimental/vertex-animation-video`: 22 exported symbols — Replay stable-topology mesh deformation and optional appearance while material, lighting, and camera response remain live.
- `three-blocks/experimental/active-frame-video`: 21 exported symbols — Decode and synchronize compact GPU-ready animation frames with bounded browser-side resources.
- `three-blocks/gaussian-splats`: 43 exported symbols — Render and stream captured 3D or animated Gaussian scenes with explicit sorting, memory, and quality controls.
- `three-blocks/experimental/gpu-interaction`: 23 exported symbols — Publish pointer, kinematic, and collider state once so multiple GPU systems can respond in the same frame.
- `three-blocks/smoke`: 28 exported symbols — Build pointer-reactive 2D or volumetric smoke with an explicit simulation and compositing quality ladder.
- `three-blocks/water`: 42 exported symbols — Simulate and render interactive water from particle volume through surface or raymarched presentation.
- `three-blocks/sdf-raymarching`: 32 exported symbols — Build GPU-readable signed-distance fields for constraints, sampling, and raymarched surfaces or volumes — including live per-frame fields rebuilt from skinned characters.
- `three-blocks/experimental/compute-foundations`: 8 exported symbols — Use sorting, prefix sums, batching, and GPU-generated geometry as the data-moving foundation for larger blocks.
- `three-blocks/experimental/runtime-sdf-text`: 4 exported symbols — Generate glyph distance fields at runtime when text cannot be known ahead of time, accepting its higher setup and memory cost.
- `three-blocks/experimental/core-tsl-effects`: 3 exported symbols — Experimental TSL effect nodes staged before promotion to the stable block.
- `three-blocks/assets`: 86 exported symbols — Typed asset manager with adapter registry, scoped leases, retry/concurrency control, and the standard three.js loader adapters (GLTF, KTX2, DRACO, HDR, fonts).
- `three-blocks/app`: 58 exported symbols — Application shell for worker-owned renderers: WorkerHost restart choreography, input forwarding, status + smoke bridges, and worker-side runtime assembly. Scaffolded starter apps stand on it.
- `three-blocks/devtools`: 10 exported symbols — Runtime devtools registration and overlay mount for apps that do not use the app shell; publishes renderer status and performance evidence to the dev overlay.
- `three-blocks/hmr`: 21 exported symbols — Hot-replacement primitives for scenes and components: snapshot capture/restore and a scene hot reloader with compile-before-commit swaps.
- `three-blocks/runtime`: 15 exported symbols — Frame dispatcher with rAF and fixed-step lanes, render priorities, and typed event triggers — the per-frame backbone used inside render workers.
- `three-blocks/shaders`: 92 exported symbols — Precompiled-shader manifest tooling and the runtime shader cache: capture, validate, hydrate, and observe TSL node builds on three r185 WebGPU.
- `three-blocks/stats`: 17 exported symbols — Main/worker performance-stats adapters (CPU/GPU timings, texture panels) feeding the dev overlay and the app shell's stats controllers.
- `three-blocks/text`: 36 exported symbols — Shared text-runtime contracts: configuration, sync batch/delivery types, font sources, and schema guards used on both sides of the worker boundary.
- `three-blocks/text/main`: 5 exported symbols — Page-side text sync: observes DOM text and publishes layout and content deliveries to the worker text renderer.
- `three-blocks/text/worker`: 11 exported symbols — Worker-side text renderer: loads fonts, builds text batches, and applies page deliveries inside the render worker.
- `three-blocks/vite`: 60 exported symbols — The Vite plugin: shader precompile capture, codec and asset wiring, dev status overlay, build receipts, and project inspection.
- `three-blocks/vite/config`: 32 exported symbols — Type declarations for the plugin-injected virtual client config (`threeBlocksConfig`, codec runtimes, build receipts).
- `three-blocks/worker`: 44 exported symbols — Typed main↔worker transport with state, event, and RPC lanes, compile-time structured-clone checking, transferables, and endpoint replacement for restarts. Knows nothing about three.js.

## `three-blocks`

The curated core barrel: stable block facades and shared types for app code. Platform machinery and experimental work ship on named subpaths, not here.

- `BatchedMSDFText` (class) — api/BatchedMSDFText
- `Boids` (variable) — api/Boids
- `ComputeBVHSampler` (variable) — api/ComputeBVHSampler
- `ComputeInstanceCulling` (variable) — api/ComputeInstanceCulling
- `ComputeMeshDynamicSurfaceSampler` (variable) — api/ComputeMeshDynamicSurfaceSampler
- `ComputeMeshSurfaceSampler` (variable) — api/ComputeMeshSurfaceSampler
- `MSDFText` (class) — api/MSDFText
- `PBF` (variable) — api/PBF
- `SPH` (variable) — api/SPH
- `SphereImpostorNodeMaterial` (class) — api/SphereImpostorNodeMaterial
- `biplanarTexture` (variable) — api/biplanarTexture
- `filmHD` (variable) — api/filmHD
- `fresnel` (variable) — api/fresnel
- `kuwahara` (variable) — api/kuwahara
- `parallaxOcclusion` (variable) — api/parallaxOcclusion
- `sphereImpostorPosition` (variable) — api/sphereImpostorPosition

## `three-blocks/app`

Application shell for worker-owned renderers: WorkerHost restart choreography, input forwarding, status + smoke bridges, and worker-side runtime assembly. Scaffolded starter apps stand on it.

- `AppChannel` (interface) — api/AppChannel
- `AppHotContext` (interface) — api/AppHotContext
- `AppPageEvents` (interface) — api/AppPageEvents
- `AppPageRequests` (type) — api/AppPageRequests
- `AppPageState` (interface) — api/AppPageState
- `AppProtocol` (interface) — api/AppProtocol
- `AppScene` (type) — api/AppScene
- `AppStatsControl` (interface) — api/AppStatsControl
- `AppStatsController` (class) — api/AppStatsController
- `AppStatsControllerOptions` (interface) — api/AppStatsControllerOptions
- `AppStatsFrameHooks` (interface) — api/AppStatsFrameHooks
- `AppStatsPanelMode` (type) — api/AppStatsPanelMode
- `AppStatsState` (interface) — api/AppStatsState
- `AppStatsWorkerController` (class) — api/AppStatsWorkerController
- `AppStatsWorkerControllerOptions` (interface) — api/AppStatsWorkerControllerOptions
- `AppWorkerEvents` (interface) — api/AppWorkerEvents
- `AppWorkerRequests` (type) — api/AppWorkerRequests
- `AppWorkerState` (interface) — api/AppWorkerState
- `CreateWorkerRuntimeOptions` (interface) — api/CreateWorkerRuntimeOptions
- `InputForwarder` (class) — api/InputForwarder
- `PageLink` (type) — api/PageLink
- `PointerState` (interface) — api/PointerState
- `RuntimeDiagnostics` (interface) — api/RuntimeDiagnostics
- `RuntimeStage` (type) — api/RuntimeStage
- `RuntimeStatus` (interface) — api/RuntimeStatus
- `STATS_PANEL_SIZE` (variable) — api/STATS_PANEL_SIZE
- `STATS_SCENE_PANEL` (variable) — api/STATS_SCENE_PANEL
- `SceneContext` (interface) — api/SceneContext
- `SceneContextOptions` (interface) — api/SceneContextOptions
- `ScrollState` (interface) — api/ScrollState
- `SmokeBridgeSource` (interface) — api/SmokeBridgeSource
- `StatsTextureRenderer` (type) — api/StatsTextureRenderer
- `StatusOverlay` (class) — api/StatusOverlay
- `ThreeBlocksReadiness` (interface) — api/ThreeBlocksReadiness
- `ThreeBlocksRuntimeFlags` (interface) — api/ThreeBlocksRuntimeFlags
- `ThreeBlocksShaderRuntimeSnapshot` (interface) — api/ThreeBlocksShaderRuntimeSnapshot
- `ThreeBlocksSmokeState` (interface) — api/ThreeBlocksSmokeState
- `ThreeBlocksTslBuildSnapshot` (interface) — api/ThreeBlocksTslBuildSnapshot
- `ViewportState` (interface) — api/ViewportState
- `VisibilityState` (interface) — api/VisibilityState
- `WorkerBootState` (interface) — api/WorkerBootState
- `WorkerHost` (class) — api/WorkerHost
- `WorkerHostOptions` (interface) — api/WorkerHostOptions
- `WorkerLink` (type) — api/WorkerLink
- `WorkerRuntime` (class) — api/WorkerRuntime
- `WorkerRuntimeConfiguration` (interface) — api/WorkerRuntimeConfiguration
- `WorkerShaderCaptureActivation` (interface) — api/WorkerShaderCaptureActivation
- `configureWorkerShaderCapture` (function) — api/configureWorkerShaderCapture
- `createInputForwarder` (function) — api/createInputForwarder
- `createWorkerRuntime` (function) — api/createWorkerRuntime
- `currentWorkerShaderCaptureActivation` (function) — api/currentWorkerShaderCaptureActivation
- `errorMessage` (function) — api/errorMessage
- `installSmokeBridge` (function) — api/installSmokeBridge
- `installSmokeBridgeSource` (function) — api/installSmokeBridgeSource
- `isAppStatsControl` (function) — api/isAppStatsControl
- `readThreeBlocksRuntimeFlags` (function) — api/readThreeBlocksRuntimeFlags
- `runtimeStageReached` (function) — api/runtimeStageReached
- `setWorkerShaderCaptureVisibility` (function) — api/setWorkerShaderCaptureVisibility

## `three-blocks/assets`

Typed asset manager with adapter registry, scoped leases, retry/concurrency control, and the standard three.js loader adapters (GLTF, KTX2, DRACO, HDR, fonts).

- `AbortSignalLike` (interface) — api/AbortSignalLike
- `AssetAdapter` (interface) — api/AssetAdapter
- `AssetAdapterCapabilities` (interface) — api/AssetAdapterCapabilities
- `AssetAdapterDefinition` (type) — api/AssetAdapterDefinition
- `AssetAdapterRecord` (type) — api/AssetAdapterRecord
- `AssetAdapterResult` (type) — api/AssetAdapterResult
- `AssetAggregateError` (class) — api/AssetAggregateError
- `AssetCacheEntrySnapshot` (interface) — api/AssetCacheEntrySnapshot
- `AssetDefinition` (interface) — api/AssetDefinition
- `AssetDefinitionForAdapters` (type) — api/AssetDefinitionForAdapters
- `AssetDevice` (type) — api/AssetDevice
- `AssetDisposeContext` (interface) — api/AssetDisposeContext
- `AssetFailure` (interface) — api/AssetFailure
- `AssetHandle` (class) — api/AssetHandle
- `AssetLease` (class) — api/AssetLease
- `AssetLoad` (class) — api/AssetLoad
- `AssetLoadContext` (interface) — api/AssetLoadContext
- `AssetLoadError` (class) — api/AssetLoadError
- `AssetLoadErrorCode` (type) — api/AssetLoadErrorCode
- `AssetLoadOptions` (interface) — api/AssetLoadOptions
- `AssetLoaderRegistry` (class) — api/AssetLoaderRegistry
- `AssetManager` (class) — api/AssetManager
- `AssetManagerOptions` (interface) — api/AssetManagerOptions
- `AssetManifestDiff` (interface) — api/AssetManifestDiff
- `AssetManifestForAdapters` (type) — api/AssetManifestForAdapters
- `AssetProgress` (interface) — api/AssetProgress
- `AssetResultForDefinition` (type) — api/AssetResultForDefinition
- `AssetResults` (type) — api/AssetResults
- `AssetRetry` (type) — api/AssetRetry
- `AssetRetryContext` (interface) — api/AssetRetryContext
- `AssetRetryPolicy` (interface) — api/AssetRetryPolicy
- `AssetScope` (class) — api/AssetScope
- `AssetSleep` (type) — api/AssetSleep
- `AssetSource` (interface) — api/AssetSource
- `AssetUrl` (type) — api/AssetUrl
- `AssetValueForDefinition` (type) — api/AssetValueForDefinition
- `AssetVariant` (interface) — api/AssetVariant
- `AssetVariants` (interface) — api/AssetVariants
- `AudioAssetDefinition` (interface) — api/AudioAssetDefinition
- `BinaryAssetDefinition` (interface) — api/BinaryAssetDefinition
- `CreateThreeAssetAdaptersOptions` (interface) — api/CreateThreeAssetAdaptersOptions
- `CubeTextureAssetDefinition` (interface) — api/CubeTextureAssetDefinition
- `ExrAssetDefinition` (interface) — api/ExrAssetDefinition
- `FontAssetDefinition` (interface) — api/FontAssetDefinition
- `GlbAssetDefinition` (interface) — api/GlbAssetDefinition
- `GltfAssetDefinition` (interface) — api/GltfAssetDefinition
- `GltfCodecConfiguration` (interface) — api/GltfCodecConfiguration
- `HdrAssetDefinition` (interface) — api/HdrAssetDefinition
- `ImageAssetDefinition` (interface) — api/ImageAssetDefinition
- `ImageAssetFormat` (type) — api/ImageAssetFormat
- `JsonAssetDefinition` (interface) — api/JsonAssetDefinition
- `Ktx2AssetDefinition` (interface) — api/Ktx2AssetDefinition
- `NamedAssetHandles` (type) — api/NamedAssetHandles
- `NamedAssetPromises` (type) — api/NamedAssetPromises
- `StandardAssetAdapters` (type) — api/StandardAssetAdapters
- `StandardAssetDefinition` (type) — api/StandardAssetDefinition
- `StandardAssetDefinitionMap` (interface) — api/StandardAssetDefinitionMap
- `StandardAssetResultMap` (type) — api/StandardAssetResultMap
- `TextureAssetDefinition` (interface) — api/TextureAssetDefinition
- `ThreeAssetAdapterError` (class) — api/ThreeAssetAdapterError
- `ThreeAssetAdapterErrorCode` (type) — api/ThreeAssetAdapterErrorCode
- `ThreeAssetAdapterRuntime` (interface) — api/ThreeAssetAdapterRuntime
- `ThreeAssetBitmap` (interface) — api/ThreeAssetBitmap
- `ThreeAssetCurvePluginFactory` (type) — api/ThreeAssetCurvePluginFactory
- `ThreeAssetDataTextureLoader` (interface) — api/ThreeAssetDataTextureLoader
- `ThreeAssetDracoLoader` (interface) — api/ThreeAssetDracoLoader
- `ThreeAssetFetch` (type) — api/ThreeAssetFetch
- `ThreeAssetFetchHeaders` (interface) — api/ThreeAssetFetchHeaders
- `ThreeAssetFetchResponse` (interface) — api/ThreeAssetFetchResponse
- `ThreeAssetGltfLoader` (interface) — api/ThreeAssetGltfLoader
- `ThreeAssetGltfPlugin` (interface) — api/ThreeAssetGltfPlugin
- `ThreeAssetImageDecoder` (type) — api/ThreeAssetImageDecoder
- `ThreeAssetKtx2Loader` (interface) — api/ThreeAssetKtx2Loader
- `ThreeAssetLoaderFactories` (interface) — api/ThreeAssetLoaderFactories
- `ThreeAssetLoaderRegistry` (type) — api/ThreeAssetLoaderRegistry
- `ThreeAssetReadableBody` (interface) — api/ThreeAssetReadableBody
- `ThreeAssetStreamReader` (interface) — api/ThreeAssetStreamReader
- `ThreeAssetThreeModule` (interface) — api/ThreeAssetThreeModule
- `ThreeStandardAssetAdapters` (type) — api/ThreeStandardAssetAdapters
- `ThreeStandardAssetResultMap` (interface) — api/ThreeStandardAssetResultMap
- `createAssetLoaderRegistry` (function) — api/createAssetLoaderRegistry
- `createAssetManager` (function) — api/createAssetManager
- `createStandardAssetLoaderRegistry` (function) — api/createStandardAssetLoaderRegistry
- `createThreeAssetAdapters` (function) — api/createThreeAssetAdapters
- `defineAssetAdapter` (function) — api/defineAssetAdapter
- `defineAssets` (function) — api/defineAssets

## `three-blocks/baked-motion`

Turn a rendered camera or timeline sequence into an interactive, depth-aware browser presentation.

- `BAKED_MOTION_TYPE` (variable) — api/BAKED_MOTION_TYPE
- `BAKED_MOTION_VERSION` (variable) — api/BAKED_MOTION_VERSION
- `BakedMotion` (variable) — api/BakedMotion
- `BakedMotionDelivery` (type) — api/BakedMotionDelivery
- `BakedMotionDiagnostics` (type) — api/BakedMotionDiagnostics
- `BakedMotionError` (class) — api/BakedMotionError
- `BakedMotionErrorCode` (type) — api/BakedMotionErrorCode
- `BakedMotionFetch` (type) — api/BakedMotionFetch
- `BakedMotionFetchResponse` (interface) — api/BakedMotionFetchResponse
- `BakedMotionFrameSample` (type) — api/BakedMotionFrameSample
- `BakedMotionGeometry` (type) — api/BakedMotionGeometry
- `BakedMotionManifest` (type) — api/BakedMotionManifest
- `BakedMotionMaterial` (type) — api/BakedMotionMaterial
- `BakedMotionMesh` (type) — api/BakedMotionMesh
- `BakedMotionOptions` (interface) — api/BakedMotionOptions
- `BakedMotionParameterValues` (type) — api/BakedMotionParameterValues
- `BakedMotionParameters` (type) — api/BakedMotionParameters
- `BakedMotionRenderer` (interface) — api/BakedMotionRenderer
- `BakedMotionRotationParameters` (type) — api/BakedMotionRotationParameters
- `BakedMotionState` (type) — api/BakedMotionState
- `BakedMotionTiltParameters` (type) — api/BakedMotionTiltParameters
- `BakedMotionTimelineParameters` (type) — api/BakedMotionTimelineParameters
- `BakedMotionViewSource` (type) — api/BakedMotionViewSource
- `paramToFrame` (variable) — api/paramToFrame
- `parseBakedMotionManifest` (variable) — api/parseBakedMotionManifest

## `three-blocks/boids`

Simulate flocking in two or three dimensions with spatial-grid acceleration and optional volume constraints.

- `Boids` (variable) — api/Boids
- `BoidsInitialPositions` (type) — api/BoidsInitialPositions
- `BoidsOptions` (interface) — api/BoidsOptions
- `SpatialGridHelper` (class) — api/SpatialGridHelper
- `spatialLookupInternals` (variable) — api/spatialLookupInternals

## `three-blocks/core-tsl-effects`

Compose reusable film, painterly, Fresnel, parallax, projection, and noise treatments inside Three.js node materials and post passes.

- `FilmHDOptions` (interface) — api/FilmHDOptions
- `KuwaharaOptions` (interface) — api/KuwaharaOptions
- `biplanarTexture` (variable) — api/biplanarTexture
- `filmHD` (variable) — api/filmHD
- `fresnel` (variable) — api/fresnel
- `kuwahara` (variable) — api/kuwahara
- `parallaxOcclusion` (variable) — api/parallaxOcclusion

## `three-blocks/devtools`

Runtime devtools registration and overlay mount for apps that do not use the app shell; publishes renderer status and performance evidence to the dev overlay.

- `DevtoolsOverlayHandle` (type) — api/DevtoolsOverlayHandle
- `DevtoolsOverlayOptions` (type) — api/DevtoolsOverlayOptions
- `DevtoolsRegistration` (interface) — api/DevtoolsRegistration
- `ObserveThreeBlocksTslBuildsOptions` (interface) — api/ObserveThreeBlocksTslBuildsOptions
- `RegisterDevtoolsOptions` (interface) — api/RegisterDevtoolsOptions
- `ThreeBlocksTslBuildObserver` (interface) — api/ThreeBlocksTslBuildObserver
- `ThreeBlocksTslBuildSnapshot` (interface) — api/ThreeBlocksTslBuildSnapshot
- `mountDevtoolsOverlay` (variable) — api/mountDevtoolsOverlay
- `observeThreeBlocksTslBuilds` (function) — api/observeThreeBlocksTslBuilds
- `registerDevtools` (function) — api/registerDevtools

## `three-blocks/experimental/active-frame-video`

Decode and synchronize compact GPU-ready animation frames with bounded browser-side resources.

- `ACTIVE_FRAME_TYPE` (variable) — api/ACTIVE_FRAME_TYPE
- `ACTIVE_FRAME_VERSION` (variable) — api/ACTIVE_FRAME_VERSION
- `AFDecoder` (variable) — api/AFDecoder
- `AFDecoderErrorCallback` (type) — api/AFDecoderErrorCallback
- `AFDecoderOptions` (interface) — api/AFDecoderOptions
- `AFDecoderProcess` (type) — api/AFDecoderProcess
- `AFDecoderSource` (type) — api/AFDecoderSource
- `AFVideo` (variable) — api/AFVideo
- `AFVideoFrameResult` (type) — api/AFVideoFrameResult
- `AFVideoNode` (type) — api/AFVideoNode
- `AFVideoOptions` (interface) — api/AFVideoOptions
- `AFVideoRGBNode` (type) — api/AFVideoRGBNode
- `AFVideoScalarNode` (type) — api/AFVideoScalarNode
- `AFVideoSetFramesOptions` (interface) — api/AFVideoSetFramesOptions
- `AFVideoSource` (type) — api/AFVideoSource
- `AFVideoUVNode` (type) — api/AFVideoUVNode
- `ActiveFrameEncodedSource` (type) — api/ActiveFrameEncodedSource
- `ActiveFrameFrame` (type) — api/ActiveFrameFrame
- `ActiveFrameManifest` (type) — api/ActiveFrameManifest
- `ActiveFrameTrackManifest` (type) — api/ActiveFrameTrackManifest
- `parseActiveFrameManifest` (function) — api/parseActiveFrameManifest

## `three-blocks/experimental/compute-foundations`

Use sorting, prefix sums, batching, and GPU-generated geometry as the data-moving foundation for larger blocks.

- `ComputeBitonicSort` (variable) — api/ComputeBitonicSort
- `ComputeBitonicSortOptions` (interface) — api/ComputeBitonicSortOptions
- `ComputeFoundationStorage` (type) — api/ComputeFoundationStorage
- `ComputeFoundationValueType` (type) — api/ComputeFoundationValueType
- `ComputePrefixSum` (variable) — api/ComputePrefixSum
- `ComputePrefixSumOptions` (interface) — api/ComputePrefixSumOptions
- `ComputeRadixSort` (variable) — api/ComputeRadixSort
- `ComputeRadixSortOptions` (type) — api/ComputeRadixSortOptions

## `three-blocks/experimental/core-tsl-effects`

Experimental TSL effect nodes staged before promotion to the stable block.

- `ComputeMipAwareBlueNoise` (class) — api/ComputeMipAwareBlueNoise
- `curlNoise` (variable) — api/curlNoise
- `structureTensor` (variable) — api/structureTensor

## `three-blocks/experimental/gpu-interaction`

Publish pointer, kinematic, and collider state once so multiple GPU systems can respond in the same frame.

- `GPUInteractionCapabilityReport` (interface) — api/GPUInteractionCapabilityReport
- `GPUInteractionGridOptions` (interface) — api/GPUInteractionGridOptions
- `GPUInteractionLimitFailure` (interface) — api/GPUInteractionLimitFailure
- `GPUInteractionPhysicsEngine` (interface) — api/GPUInteractionPhysicsEngine
- `GPUInteractionPhysicsOptions` (interface) — api/GPUInteractionPhysicsOptions
- `GPUInteractionPhysicsSource` (interface) — api/GPUInteractionPhysicsSource
- `GPUInteractionPhysicsStep` (type) — api/GPUInteractionPhysicsStep
- `GPUInteractionQueryMode` (type) — api/GPUInteractionQueryMode
- `GPUInteractionRequiredRendererLimits` (interface) — api/GPUInteractionRequiredRendererLimits
- `GPUInteractionSimulation` (interface) — api/GPUInteractionSimulation
- `GPUInteractionSimulationOptions` (interface) — api/GPUInteractionSimulationOptions
- `GPUInteractionSizingReport` (interface) — api/GPUInteractionSizingReport
- `GPUInteractionSource` (interface) — api/GPUInteractionSource
- `GPUInteractionSourceRange` (interface) — api/GPUInteractionSourceRange
- `GPUInteractionStats` (interface) — api/GPUInteractionStats
- `GPUInteractionStorageRendererLimits` (interface) — api/GPUInteractionStorageRendererLimits
- `GPUInteractionSystem` (variable) — api/GPUInteractionSystem
- `GPUInteractionSystemOptions` (interface) — api/GPUInteractionSystemOptions
- `GPUInteractionWorld` (variable) — api/GPUInteractionWorld
- `GPUInteractionWorldOptions` (interface) — api/GPUInteractionWorldOptions
- `KinematicInteractionShape` (type) — api/KinematicInteractionShape
- `KinematicInteractionSource` (variable) — api/KinematicInteractionSource
- `KinematicInteractionSourceOptions` (interface) — api/KinematicInteractionSourceOptions

## `three-blocks/experimental/object-animation-video`

Replay compact authored transforms for many rigid parts while geometry, materials, lighting, and per-object binding remain live.

- `OAV_MANIFEST_TYPE` (variable) — api/OAV_MANIFEST_TYPE
- `OAV_MANIFEST_VERSION` (variable) — api/OAV_MANIFEST_VERSION
- `ObjectAnimationVideo` (variable) — api/ObjectAnimationVideo
- `ObjectAnimationVideoBindOptions` (interface) — api/ObjectAnimationVideoBindOptions
- `ObjectAnimationVideoBindResult` (interface) — api/ObjectAnimationVideoBindResult
- `ObjectAnimationVideoBinding` (type) — api/ObjectAnimationVideoBinding
- `ObjectAnimationVideoDecodeEvent` (interface) — api/ObjectAnimationVideoDecodeEvent
- `ObjectAnimationVideoDiagnostics` (type) — api/ObjectAnimationVideoDiagnostics
- `ObjectAnimationVideoErrorEvent` (interface) — api/ObjectAnimationVideoErrorEvent
- `ObjectAnimationVideoEventMap` (interface) — api/ObjectAnimationVideoEventMap
- `ObjectAnimationVideoFetch` (type) — api/ObjectAnimationVideoFetch
- `ObjectAnimationVideoFetchResponse` (interface) — api/ObjectAnimationVideoFetchResponse
- `ObjectAnimationVideoFileValue` (type) — api/ObjectAnimationVideoFileValue
- `ObjectAnimationVideoFiles` (type) — api/ObjectAnimationVideoFiles
- `ObjectAnimationVideoFrameEvent` (interface) — api/ObjectAnimationVideoFrameEvent
- `ObjectAnimationVideoInstanceBinding` (interface) — api/ObjectAnimationVideoInstanceBinding
- `ObjectAnimationVideoInstanceMapping` (type) — api/ObjectAnimationVideoInstanceMapping
- `ObjectAnimationVideoInstanceTarget` (interface) — api/ObjectAnimationVideoInstanceTarget
- `ObjectAnimationVideoLoadOptions` (interface) — api/ObjectAnimationVideoLoadOptions
- `ObjectAnimationVideoManifest` (type) — api/ObjectAnimationVideoManifest
- `ObjectAnimationVideoObjectBinding` (interface) — api/ObjectAnimationVideoObjectBinding
- `ObjectAnimationVideoObjectSelector` (type) — api/ObjectAnimationVideoObjectSelector
- `ObjectAnimationVideoOptions` (interface) — api/ObjectAnimationVideoOptions
- `ObjectAnimationVideoPlaybackOptions` (interface) — api/ObjectAnimationVideoPlaybackOptions
- `ObjectAnimationVideoUnbindOptions` (interface) — api/ObjectAnimationVideoUnbindOptions
- `parseOAVManifest` (variable) — api/parseOAVManifest

## `three-blocks/experimental/runtime-sdf-text`

Generate glyph distance fields at runtime when text cannot be known ahead of time, accepting its higher setup and memory cost.

- `BatchedText` (class) — api/BatchedText
- `Text` (class) — api/Text
- `getAtlasesInfo` (function) — api/getAtlasesInfo
- `textDrawId` (variable) — api/textDrawId

## `three-blocks/experimental/vertex-animation-video`

Replay stable-topology mesh deformation and optional appearance while material, lighting, and camera response remain live.

- `VAVBase` (type) — api/VAVBase
- `VAVManifest` (type) — api/VAVManifest
- `VAVMesh` (variable) — api/VAVMesh
- `VAVMeshAppearance` (type) — api/VAVMeshAppearance
- `VAVMeshDiagnostics` (type) — api/VAVMeshDiagnostics
- `VAVMeshFetch` (type) — api/VAVMeshFetch
- `VAVMeshFetchResponse` (interface) — api/VAVMeshFetchResponse
- `VAVMeshFileResolver` (type) — api/VAVMeshFileResolver
- `VAVMeshFiles` (type) — api/VAVMeshFiles
- `VAVMeshLoadOptions` (interface) — api/VAVMeshLoadOptions
- `VAVMeshOptions` (interface) — api/VAVMeshOptions
- `VAVNumericalTrack` (type) — api/VAVNumericalTrack
- `VAVTrackDecoderManifest` (type) — api/VAVTrackDecoderManifest
- `VAVTrackDescriptor` (type) — api/VAVTrackDescriptor
- `VAVTrackFetch` (type) — api/VAVTrackFetch
- `VAVTrackFetchResponse` (interface) — api/VAVTrackFetchResponse
- `VAVTrackStream` (variable) — api/VAVTrackStream
- `VAVTrackStreamOptions` (interface) — api/VAVTrackStreamOptions
- `VAV_MANIFEST_TYPE` (variable) — api/VAV_MANIFEST_TYPE
- `VAV_MANIFEST_VERSION` (variable) — api/VAV_MANIFEST_VERSION
- `parseVAVBase` (variable) — api/parseVAVBase
- `parseVAVManifest` (variable) — api/parseVAVManifest

## `three-blocks/gaussian-splats`

Render and stream captured 3D or animated Gaussian scenes with explicit sorting, memory, and quality controls.

- `GaussianSplats` (variable) — api/GaussianSplats
- `GaussianSplatsAppearanceOptions` (interface) — api/GaussianSplatsAppearanceOptions
- `GaussianSplatsData` (interface) — api/GaussianSplatsData
- `GaussianSplatsGPUTimings` (interface) — api/GaussianSplatsGPUTimings
- `GaussianSplatsHelper` (class) — api/GaussianSplatsHelper
- `GaussianSplatsLoadOptions` (interface) — api/GaussianSplatsLoadOptions
- `GaussianSplatsLoadTimings` (interface) — api/GaussianSplatsLoadTimings
- `GaussianSplatsLoader` (variable) — api/GaussianSplatsLoader
- `GaussianSplatsLoaderOptions` (interface) — api/GaussianSplatsLoaderOptions
- `GaussianSplatsOptions` (interface) — api/GaussianSplatsOptions
- `GaussianSplatsPoints` (class) — api/GaussianSplatsPoints
- `GaussianSplatsProcessingProgress` (interface) — api/GaussianSplatsProcessingProgress
- `GaussianSplatsQuality` (type) — api/GaussianSplatsQuality
- `GaussianSplatsRenderEvent` (interface) — api/GaussianSplatsRenderEvent
- `GaussianSplatsRenderRecommendation` (interface) — api/GaussianSplatsRenderRecommendation
- `GaussianSplatsStats` (interface) — api/GaussianSplatsStats
- `GaussianSplatsStream` (variable) — api/GaussianSplatsStream
- `GaussianSplatsStreamLODOptions` (interface) — api/GaussianSplatsStreamLODOptions
- `GaussianSplatsStreamOptions` (interface) — api/GaussianSplatsStreamOptions
- `GaussianSplatsStreamProgressEvent` (interface) — api/GaussianSplatsStreamProgressEvent
- `GaussianSplatsStreamRendererOptions` (interface) — api/GaussianSplatsStreamRendererOptions
- `GaussianSplatsStreamStats` (interface) — api/GaussianSplatsStreamStats
- `GaussianSplatsWaitOptions` (interface) — api/GaussianSplatsWaitOptions
- `SplatClip` (class) — api/SplatClip
- `SplatMesh` (class) — api/SplatMesh
- `SplatSequence` (class) — api/SplatSequence
- `SplatSkin` (class) — api/SplatSkin
- `SplatSkinOptions` (interface) — api/SplatSkinOptions
- `SplatVoxelCollider` (class) — api/SplatVoxelCollider
- `SplatVoxelColliderOptions` (interface) — api/SplatVoxelColliderOptions
- `VoxelCharacterController` (class) — api/VoxelCharacterController
- `VoxelCharacterControllerOptions` (interface) — api/VoxelCharacterControllerOptions
- `gaussianAAFactor` (variable) — api/gaussianAAFactor
- `gaussianAlphaUV` (variable) — api/gaussianAlphaUV
- `gaussianColor` (variable) — api/gaussianColor
- `gaussianDepth` (variable) — api/gaussianDepth
- `gaussianHue` (variable) — api/gaussianHue
- `gaussianLuminance` (variable) — api/gaussianLuminance
- `gaussianNormal` (variable) — api/gaussianNormal
- `gaussianPower` (variable) — api/gaussianPower
- `gaussianSH` (variable) — api/gaussianSH
- `gaussianSHColor` (variable) — api/gaussianSHColor
- `gaussianUV` (variable) — api/gaussianUV

## `three-blocks/grid-pristine`

Add an infinite anti-aliased reference grid with two independently styled world-space layers.

- `GridPristine` (class) — api/GridPristine

## `three-blocks/hmr`

Hot-replacement primitives for scenes and components: snapshot capture/restore and a scene hot reloader with compile-before-commit swaps.

- `ComponentHotOperationContext` (interface) — api/ComponentHotOperationContext
- `ComponentHotRegistry` (class) — api/ComponentHotRegistry
- `ComponentHotRegistryOptions` (interface) — api/ComponentHotRegistryOptions
- `ComponentHotSnapshot` (interface) — api/ComponentHotSnapshot
- `ComponentMountRequest` (interface) — api/ComponentMountRequest
- `ComponentReplacementResult` (interface) — api/ComponentReplacementResult
- `HotReplacementError` (class) — api/HotReplacementError
- `HotReplacementPhase` (type) — api/HotReplacementPhase
- `HotScene` (interface) — api/HotScene
- `HotSceneFactory` (type) — api/HotSceneFactory
- `MaybePromise` (type) — api/MaybePromise
- `SceneHotReloader` (class) — api/SceneHotReloader
- `SceneHotReloaderOptions` (interface) — api/SceneHotReloaderOptions
- `SceneReplacementResult` (interface) — api/SceneReplacementResult
- `ThreeComponent` (class) — api/ThreeComponent
- `ThreeComponentClass` (type) — api/ThreeComponentClass
- `captureComponentHotSnapshot` (function) — api/captureComponentHotSnapshot
- `createComponentHotRegistry` (function) — api/createComponentHotRegistry
- `createSceneHotReloader` (function) — api/createSceneHotReloader
- `restoreComponentHotSnapshot` (function) — api/restoreComponentHotSnapshot
- `transferDeclaredHotState` (function) — api/transferDeclaredHotState

## `three-blocks/instance-culling`

Cull large instance sets on the GPU before shading and drawing the visible survivors.

- `ComputeInstanceCulling` (variable) — api/ComputeInstanceCulling
- `ComputeInstanceCullingBoundingSphere` (interface) — api/ComputeInstanceCullingBoundingSphere
- `ComputeInstanceCullingBoundingSphereResult` (interface) — api/ComputeInstanceCullingBoundingSphereResult
- `ComputeInstanceCullingBoundsData` (type) — api/ComputeInstanceCullingBoundsData
- `ComputeInstanceCullingBufferSource` (type) — api/ComputeInstanceCullingBufferSource
- `ComputeInstanceCullingCommonOptions` (interface) — api/ComputeInstanceCullingCommonOptions
- `ComputeInstanceCullingMeshOptions` (interface) — api/ComputeInstanceCullingMeshOptions
- `ComputeInstanceCullingOptions` (type) — api/ComputeInstanceCullingOptions
- `ComputeInstanceCullingStandaloneOptions` (interface) — api/ComputeInstanceCullingStandaloneOptions
- `ComputeInstanceCullingStorageAttribute` (type) — api/ComputeInstanceCullingStorageAttribute
- `LOD_MODE_EXP` (variable) — api/LOD_MODE_EXP
- `instanceCullingIndex` (variable) — api/instanceCullingIndex
- `instanceCullingMatrix` (variable) — api/instanceCullingMatrix

## `three-blocks/mpm`

Build custom particle-grid simulations with explicit material models, forces, seeding, diagnostics, and render mirrors.

- `MPMBoundaryOptions` (interface) — api/MPMBoundaryOptions
- `MPMCFLConfiguration` (interface) — api/MPMCFLConfiguration
- `MPMComputeBatch` (interface) — api/MPMComputeBatch
- `MPMCoreGraph` (interface) — api/MPMCoreGraph
- `MPMCoreKernels` (interface) — api/MPMCoreKernels
- `MPMDiagnosticsOptions` (interface) — api/MPMDiagnosticsOptions
- `MPMDiagnosticsSnapshot` (interface) — api/MPMDiagnosticsSnapshot
- `MPMElasticModel` (class) — api/MPMElasticModel
- `MPMElasticModelOptions` (interface) — api/MPMElasticModelOptions
- `MPMElasticParticleFields` (interface) — api/MPMElasticParticleFields
- `MPMElasticUniforms` (interface) — api/MPMElasticUniforms
- `MPMFluidModel` (class) — api/MPMFluidModel
- `MPMFluidModelOptions` (interface) — api/MPMFluidModelOptions
- `MPMFluidUniforms` (interface) — api/MPMFluidUniforms
- `MPMFormulation` (type) — api/MPMFormulation
- `MPMGranularModel` (class) — api/MPMGranularModel
- `MPMGranularModelOptions` (interface) — api/MPMGranularModelOptions
- `MPMGranularUniforms` (interface) — api/MPMGranularUniforms
- `MPMGridForce` (type) — api/MPMGridForce
- `MPMGridForceContext` (interface) — api/MPMGridForceContext
- `MPMIntegrationProfile` (type) — api/MPMIntegrationProfile
- `MPMMaterialModel` (interface) — api/MPMMaterialModel
- `MPMMaterialParticleContext` (interface) — api/MPMMaterialParticleContext
- `MPMMaterialStressContext` (interface) — api/MPMMaterialStressContext
- `MPMMaterialUpdateContext` (type) — api/MPMMaterialUpdateContext
- `MPMP2GMode` (type) — api/MPMP2GMode
- `MPMParticleField` (interface) — api/MPMParticleField
- `MPMParticleFieldMap` (type) — api/MPMParticleFieldMap
- `MPMParticleFieldType` (type) — api/MPMParticleFieldType
- `MPMParticleForce` (type) — api/MPMParticleForce
- `MPMParticleForceContext` (interface) — api/MPMParticleForceContext
- `MPMParticleNode` (interface) — api/MPMParticleNode
- `MPMParticleUpdate` (type) — api/MPMParticleUpdate
- `MPMParticleUpdateContext` (interface) — api/MPMParticleUpdateContext
- `MPMPostPasses` (type) — api/MPMPostPasses
- `MPMResolvedSortingOptions` (interface) — api/MPMResolvedSortingOptions
- `MPMSeedContext` (interface) — api/MPMSeedContext
- `MPMSeedInitializer` (type) — api/MPMSeedInitializer
- `MPMSeedState` (interface) — api/MPMSeedState
- `MPMSolver` (class) — api/MPMSolver
- `MPMSolverOptions` (interface) — api/MPMSolverOptions
- `MPMSolverUniforms` (interface) — api/MPMSolverUniforms
- `MPMSortingOptions` (interface) — api/MPMSortingOptions
- `MPMStepPostPassContext` (interface) — api/MPMStepPostPassContext
- `MPMStepStats` (interface) — api/MPMStepStats

## `three-blocks/msdf-text`

Draw crisp spatial or screen-space text from a pre-baked atlas with predictable runtime cost.

- `BatchedMSDFText` (class) — api/BatchedMSDFText
- `BatchedMSDFTextAddOptions` (interface) — api/BatchedMSDFTextAddOptions
- `BatchedMSDFTextLayoutInfo` (interface) — api/BatchedMSDFTextLayoutInfo
- `BatchedMSDFTextLayoutPatch` (interface) — api/BatchedMSDFTextLayoutPatch
- `BatchedMSDFTextOptions` (interface) — api/BatchedMSDFTextOptions
- `MSDFFont` (class) — api/MSDFFont
- `MSDFGlyph` (interface) — api/MSDFGlyph
- `MSDFText` (class) — api/MSDFText
- `MSDFTextLayoutInfo` (interface) — api/MSDFTextLayoutInfo
- `MSDFTextLineInput` (interface) — api/MSDFTextLineInput
- `MSDFTextOptions` (interface) — api/MSDFTextOptions
- `ParseMSDFFontOptions` (interface) — api/ParseMSDFFontOptions
- `parseMSDFFont` (function) — api/parseMSDFFont

## `three-blocks/pbf`

Model interactive incompressible particles with iterative positional constraints and predictable iteration controls.

- `PBF` (variable) — api/PBF
- `PBFArtificialPressureOptions` (interface) — api/PBFArtificialPressureOptions
- `PBFCalibrationMode` (type) — api/PBFCalibrationMode
- `PBFCalibrationSnapshot` (interface) — api/PBFCalibrationSnapshot
- `PBFComponents` (type) — api/PBFComponents
- `PBFDiagnosticsOptions` (interface) — api/PBFDiagnosticsOptions
- `PBFDimension` (type) — api/PBFDimension
- `PBFDomainBindingOptions` (interface) — api/PBFDomainBindingOptions
- `PBFDomainOptions` (interface) — api/PBFDomainOptions
- `PBFInitialPositions` (type) — api/PBFInitialPositions
- `PBFInitializationMode` (type) — api/PBFInitializationMode
- `PBFInitializationOptions` (interface) — api/PBFInitializationOptions
- `PBFMaterialOptions` (interface) — api/PBFMaterialOptions
- `PBFMaterialPreset` (type) — api/PBFMaterialPreset
- `PBFMetricSummary` (interface) — api/PBFMetricSummary
- `PBFMetrics` (interface) — api/PBFMetrics
- `PBFNeighborOptions` (interface) — api/PBFNeighborOptions
- `PBFOptions` (interface) — api/PBFOptions
- `PBFParticlesOptions` (interface) — api/PBFParticlesOptions
- `PBFResetOptions` (interface) — api/PBFResetOptions
- `PBFSolverMaterialOptions` (interface) — api/PBFSolverMaterialOptions
- `PBFSolverOptions` (interface) — api/PBFSolverOptions
- `PBFStats` (interface) — api/PBFStats
- `PBFTimeStepOptions` (interface) — api/PBFTimeStepOptions
- `PBFVectorComponents` (interface) — api/PBFVectorComponents

## `three-blocks/runtime`

Frame dispatcher with rAF and fixed-step lanes, render priorities, and typed event triggers — the per-frame backbone used inside render workers.

- `Dispatcher` (class) — api/Dispatcher
- `DispatcherOptions` (interface) — api/DispatcherOptions
- `EventHandler` (type) — api/EventHandler
- `EventMethodMap` (type) — api/EventMethodMap
- `EventName` (type) — api/EventName
- `FixedStepInput` (interface) — api/FixedStepInput
- `FixedStepReset` (interface) — api/FixedStepReset
- `FrameContext` (type) — api/FrameContext
- `FrameInput` (interface) — api/FrameInput
- `FrameLifecycle` (interface) — api/FrameLifecycle
- `FrameTiming` (interface) — api/FrameTiming
- `RafOptions` (interface) — api/RafOptions
- `RuntimeComponent` (type) — api/RuntimeComponent
- `TriggerOptions` (interface) — api/TriggerOptions
- `createDispatcher` (function) — api/createDispatcher

## `three-blocks/sdf-raymarching`

Build GPU-readable signed-distance fields for constraints, sampling, and raymarched surfaces or volumes — including live per-frame fields rebuilt from skinned characters.

- `BVHVolumeConstraint` (variable) — api/BVHVolumeConstraint
- `BVHVolumeConstraintMode` (type) — api/BVHVolumeConstraintMode
- `BVHVolumeConstraintOptions` (interface) — api/BVHVolumeConstraintOptions
- `ComputePointsSDFGenerator` (class) — api/ComputePointsSDFGenerator
- `ComputeSDFGenerator` (variable) — api/ComputeSDFGenerator
- `RayMarchSDFMaterialOptions` (interface) — api/RayMarchSDFMaterialOptions
- `RayMarchSDFNodeMaterial` (variable) — api/RayMarchSDFNodeMaterial
- `RaymarchingBox` (variable) — api/RaymarchingBox
- `RenderSDFLayerNodeMaterial` (class) — api/RenderSDFLayerNodeMaterial
- `SDFBoundaryApplyOptions` (interface) — api/SDFBoundaryApplyOptions
- `SDFFieldNodes` (interface) — api/SDFFieldNodes
- `SDFFieldNodesOptions` (interface) — api/SDFFieldNodesOptions
- `SDFFieldNodesSource` (interface) — api/SDFFieldNodesSource
- `SDFFieldOcclusionOptions` (interface) — api/SDFFieldOcclusionOptions
- `SDFFieldShadowOptions` (interface) — api/SDFFieldShadowOptions
- `SDFGeneratorOptions` (interface) — api/SDFGeneratorOptions
- `SDFParticleVectorStorage` (type) — api/SDFParticleVectorStorage
- `SDFSliceVolumeNodeMaterial` (class) — api/SDFSliceVolumeNodeMaterial
- `SDFTextureOutput` (type) — api/SDFTextureOutput
- `SDFVolumeConstraint` (variable) — api/SDFVolumeConstraint
- `SDFVolumeConstraintOptions` (interface) — api/SDFVolumeConstraintOptions
- `SDFVolumeSource` (interface) — api/SDFVolumeSource
- `SkinnedMeshSDF` (variable) — api/SkinnedMeshSDF
- `SkinnedMeshSDFCollideOptions` (interface) — api/SkinnedMeshSDFCollideOptions
- `SkinnedMeshSDFOptions` (interface) — api/SkinnedMeshSDFOptions
- `SkinnedMeshSDFSamplePosition` (type) — api/SkinnedMeshSDFSamplePosition
- `SkinnedMeshSDFScalar` (type) — api/SkinnedMeshSDFScalar
- `SkinnedMeshSDFUniforms` (interface) — api/SkinnedMeshSDFUniforms
- `createSDFBoundsHelper` (function) — api/createSDFBoundsHelper
- `createSDFPointCloudHelper` (function) — api/createSDFPointCloudHelper
- `sdfFieldNodes` (function) — api/sdfFieldNodes--case-73-64-66-46-69-65-6c-64-4e-6f-64-65-73
- `updateSDFBoundsHelper` (function) — api/updateSDFBoundsHelper

## `three-blocks/shaders`

Precompiled-shader manifest tooling and the runtime shader cache: capture, validate, hydrate, and observe TSL node builds on three r185 WebGPU.

- `AutomaticShaderHydration` (interface) — api/AutomaticShaderHydration
- `BuilderStateTuple` (type) — api/BuilderStateTuple
- `HydratedBuilderState` (interface) — api/HydratedBuilderState
- `InstallShaderCacheOptions` (interface) — api/InstallShaderCacheOptions
- `NodeAddress` (type) — api/NodeAddress
- `PRECOMPILED_MANIFEST_VERSION` (variable) — api/PRECOMPILED_MANIFEST_VERSION
- `PrecompiledAttribute` (interface) — api/PrecompiledAttribute
- `PrecompiledAutomaticRegistration` (interface) — api/PrecompiledAutomaticRegistration
- `PrecompiledBinding` (interface) — api/PrecompiledBinding
- `PrecompiledBindingGroup` (interface) — api/PrecompiledBindingGroup
- `PrecompiledBindingUniform` (interface) — api/PrecompiledBindingUniform
- `PrecompiledDeclaration` (type) — api/PrecompiledDeclaration
- `PrecompiledManifest` (interface) — api/PrecompiledManifest
- `PrecompiledObserver` (interface) — api/PrecompiledObserver
- `PrecompiledRuntimeCompatibility` (interface) — api/PrecompiledRuntimeCompatibility
- `PrecompiledState` (interface) — api/PrecompiledState
- `SHADER_ADDRESS_SCHEMA_VERSION` (variable) — api/SHADER_ADDRESS_SCHEMA_VERSION
- `SHADER_CAPTURE_CACHE_HOOK` (variable) — api/SHADER_CAPTURE_CACHE_HOOK
- `SHADER_CAPTURE_CACHE_VALUE` (variable) — api/SHADER_CAPTURE_CACHE_VALUE
- `SHADER_HYDRATION_SCHEMA_VERSION` (variable) — api/SHADER_HYDRATION_SCHEMA_VERSION
- `SHADER_RECIPE_SCHEMA_VERSION` (variable) — api/SHADER_RECIPE_SCHEMA_VERSION
- `SerializedShaderValue` (type) — api/SerializedShaderValue
- `ShaderAddressContext` (interface) — api/ShaderAddressContext
- `ShaderAddressError` (class) — api/ShaderAddressError
- `ShaderAnchor` (interface) — api/ShaderAnchor
- `ShaderAutomaticRegistrationOptions` (interface) — api/ShaderAutomaticRegistrationOptions
- `ShaderBackend` (type) — api/ShaderBackend
- `ShaderBindingBuilder` (interface) — api/ShaderBindingBuilder
- `ShaderBindingGroupLike` (interface) — api/ShaderBindingGroupLike
- `ShaderBindingLike` (interface) — api/ShaderBindingLike
- `ShaderBuildKind` (type) — api/ShaderBuildKind
- `ShaderBuildState` (interface) — api/ShaderBuildState
- `ShaderCache` (class) — api/ShaderCache
- `ShaderCacheProvider` (class) — api/ShaderCacheProvider
- `ShaderCacheProviderOptions` (interface) — api/ShaderCacheProviderOptions
- `ShaderCaptureCacheHook` (type) — api/ShaderCaptureCacheHook
- `ShaderCompatibility` (interface) — api/ShaderCompatibility
- `ShaderContainerRegistration` (interface) — api/ShaderContainerRegistration
- `ShaderCoverage` (interface) — api/ShaderCoverage
- `ShaderHydrationError` (class) — api/ShaderHydrationError
- `ShaderInvalidation` (interface) — api/ShaderInvalidation
- `ShaderManifestError` (class) — api/ShaderManifestError
- `ShaderManifestIssue` (interface) — api/ShaderManifestIssue
- `ShaderManifestState` (type) — api/ShaderManifestState
- `ShaderManifestValidation` (type) — api/ShaderManifestValidation
- `ShaderNodeChild` (interface) — api/ShaderNodeChild
- `ShaderNodeLike` (interface) — api/ShaderNodeLike
- `ShaderPathSegment` (type) — api/ShaderPathSegment
- `ShaderProviderHook` (interface) — api/ShaderProviderHook
- `ShaderProviderInstallError` (class) — api/ShaderProviderInstallError
- `ShaderProviderInstallation` (interface) — api/ShaderProviderInstallation
- `ShaderRegistration` (interface) — api/ShaderRegistration
- `ShaderRegistrationHandle` (interface) — api/ShaderRegistrationHandle
- `ShaderRegistrationKind` (type) — api/ShaderRegistrationKind
- `ShaderRegistrationOptions` (interface) — api/ShaderRegistrationOptions
- `ShaderRenderObjectLike` (interface) — api/ShaderRenderObjectLike
- `ShaderRuntimeLogger` (type) — api/ShaderRuntimeLogger
- `ShaderRuntimeStats` (interface) — api/ShaderRuntimeStats
- `ShaderSceneCache` (class) — api/ShaderSceneCache
- `ShaderSceneCacheOptions` (interface) — api/ShaderSceneCacheOptions
- `ShaderStage` (type) — api/ShaderStage
- `ShaderUniformBindingLike` (interface) — api/ShaderUniformBindingLike
- `THREE_R185_MATERIAL_SLOTS` (variable) — api/THREE_R185_MATERIAL_SLOTS
- `THREE_WEBGL_R185_COMPATIBILITY` (variable) — api/THREE_WEBGL_R185_COMPATIBILITY
- `THREE_WEBGL_R186_COMPATIBILITY` (variable) — api/THREE_WEBGL_R186_COMPATIBILITY
- `THREE_WEBGPU_R185_COMPATIBILITY` (variable) — api/THREE_WEBGPU_R185_COMPATIBILITY
- `THREE_WEBGPU_R186_COMPATIBILITY` (variable) — api/THREE_WEBGPU_R186_COMPATIBILITY
- `ThreeWebGPUCompatibilityOptions` (interface) — api/ThreeWebGPUCompatibilityOptions
- `ThreeWebGPURecipe` (type) — api/ThreeWebGPURecipe
- `ThreeWebGPURecipeContext` (interface) — api/ThreeWebGPURecipeContext
- `assertThreeWebGPUR185` (function) — api/assertThreeWebGPUR185
- `bindingKindOf` (function) — api/bindingKindOf
- `childrenOf` (function) — api/childrenOf
- `containerRoot` (function) — api/containerRoot
- `createShaderCache` (function) — api/createShaderCache
- `createThreeShaderCompatibility` (function) — api/createThreeShaderCompatibility
- `createThreeWebGLShaderCompatibility` (function) — api/createThreeWebGLShaderCompatibility
- `createThreeWebGPUShaderCompatibility` (function) — api/createThreeWebGPUShaderCompatibility
- `definePrecompiledManifest` (function) — api/definePrecompiledManifest
- `emptyPrecompiledManifest` (function) — api/emptyPrecompiledManifest
- `indexNodeGraph` (function) — api/indexNodeGraph
- `installAutomaticShaderHydration` (function) — api/installAutomaticShaderHydration
- `installShaderCache` (function) — api/installShaderCache
- `offerRendererToShaderCapture` (function) — api/offerRendererToShaderCapture
- `parsePrecompiledManifest` (function) — api/parsePrecompiledManifest
- `resolveContainerValue` (function) — api/resolveContainerValue
- `resolveNodeAddress` (function) — api/resolveNodeAddress
- `resolveNodePath` (function) — api/resolveNodePath
- `shaderCache` (variable) — api/shaderCache--case-73-68-61-64-65-72-43-61-63-68-65
- `stateKind` (function) — api/stateKind
- `threeShaderCompatibilityId` (function) — api/threeShaderCompatibilityId
- `validatePrecompiledManifest` (function) — api/validatePrecompiledManifest

## `three-blocks/smoke`

Build pointer-reactive 2D or volumetric smoke with an explicit simulation and compositing quality ladder.

- `SmokeDomainBindingOptions` (interface) — api/SmokeDomainBindingOptions
- `SmokeMultigridPreset` (type) — api/SmokeMultigridPreset
- `SmokeNodePointerInput` (type) — api/SmokeNodePointerInput
- `SmokeNodeResult` (interface) — api/SmokeNodeResult
- `SmokePressureSolver` (type) — api/SmokePressureSolver
- `SmokePressureSolverOptions` (interface) — api/SmokePressureSolverOptions
- `SmokeRenderCacheOptions` (interface) — api/SmokeRenderCacheOptions
- `SmokeSplatBlendMode` (type) — api/SmokeSplatBlendMode
- `SmokeSplatExecutionPath` (type) — api/SmokeSplatExecutionPath
- `SmokeSplatMode` (type) — api/SmokeSplatMode
- `SmokeSplatOptions` (interface) — api/SmokeSplatOptions
- `SmokeSplatStats` (interface) — api/SmokeSplatStats
- `SmokeStepOptions` (interface) — api/SmokeStepOptions
- `SmokeStepStats` (interface) — api/SmokeStepStats
- `SmokeTurbulenceMode` (type) — api/SmokeTurbulenceMode
- `SmokeVolume` (variable) — api/SmokeVolume
- `SmokeVolumeOptions` (interface) — api/SmokeVolumeOptions
- `VolumeSmokeNodeMaterial` (variable) — api/VolumeSmokeNodeMaterial
- `VolumeSmokeNodeMaterialOptions` (interface) — api/VolumeSmokeNodeMaterialOptions
- `VolumeSmokeOutputMode` (type) — api/VolumeSmokeOutputMode
- `VolumeSmokeRenderCompositor` (class) — api/VolumeSmokeRenderCompositor
- `VolumeSmokeShaderOptions` (interface) — api/VolumeSmokeShaderOptions
- `VolumeSmokeTextureInput` (type) — api/VolumeSmokeTextureInput
- `VolumeSmokeTextureOptions` (interface) — api/VolumeSmokeTextureOptions
- `VolumeSmokeTextureSyncOptions` (interface) — api/VolumeSmokeTextureSyncOptions
- `smoke` (variable) — api/smoke
- `smokeRTT` (variable) — api/smokeRTT
- `volumeSmokeShadow` (function) — api/volumeSmokeShadow

## `three-blocks/sph`

Model pressure-driven particle fluids when force behavior matters more than PBF-style constraint convergence.

- `SPH` (variable) — api/SPH
- `SPHCalibrationMode` (type) — api/SPHCalibrationMode
- `SPHCalibrationSnapshot` (interface) — api/SPHCalibrationSnapshot
- `SPHComponents` (type) — api/SPHComponents
- `SPHDiagnosticsOptions` (interface) — api/SPHDiagnosticsOptions
- `SPHDimension` (type) — api/SPHDimension
- `SPHDomainBindingOptions` (interface) — api/SPHDomainBindingOptions
- `SPHDomainOptions` (interface) — api/SPHDomainOptions
- `SPHEquationOfState` (type) — api/SPHEquationOfState
- `SPHInitialPositions` (type) — api/SPHInitialPositions
- `SPHInitializationMode` (type) — api/SPHInitializationMode
- `SPHInitializationOptions` (interface) — api/SPHInitializationOptions
- `SPHMaterialOptions` (interface) — api/SPHMaterialOptions
- `SPHMaterialPreset` (type) — api/SPHMaterialPreset
- `SPHMetricSummary` (interface) — api/SPHMetricSummary
- `SPHMetrics` (interface) — api/SPHMetrics
- `SPHNegativePressurePolicy` (type) — api/SPHNegativePressurePolicy
- `SPHNeighborOptions` (interface) — api/SPHNeighborOptions
- `SPHOptions` (interface) — api/SPHOptions
- `SPHParticlesOptions` (interface) — api/SPHParticlesOptions
- `SPHRendererLimits` (interface) — api/SPHRendererLimits
- `SPHResetOptions` (interface) — api/SPHResetOptions
- `SPHSolverMaterialOptions` (interface) — api/SPHSolverMaterialOptions
- `SPHSolverOptions` (interface) — api/SPHSolverOptions
- `SPHStats` (interface) — api/SPHStats
- `SPHTimeStepOptions` (interface) — api/SPHTimeStepOptions
- `SPHTimeStepPolicy` (type) — api/SPHTimeStepPolicy
- `SPHVectorComponents` (interface) — api/SPHVectorComponents

## `three-blocks/sphere-impostors`

Shade one-triangle particle impostors as lit spheres when hardware sphere geometry would dominate vertex cost.

- `SphereImpostorNodeMaterial` (class) — api/SphereImpostorNodeMaterial
- `SphereImpostorNodeMaterialParameters` (interface) — api/SphereImpostorNodeMaterialParameters
- `SphereImpostorNormalNodeMaterial` (class) — api/SphereImpostorNormalNodeMaterial
- `SphereImpostorPositionConfig` (interface) — api/SphereImpostorPositionConfig
- `SphereImpostorToonNodeMaterial` (class) — api/SphereImpostorToonNodeMaterial
- `sphereImpostorAlpha` (variable) — api/sphereImpostorAlpha
- `sphereImpostorDepth` (variable) — api/sphereImpostorDepth
- `sphereImpostorNormal` (variable) — api/sphereImpostorNormal
- `sphereImpostorPosition` (variable) — api/sphereImpostorPosition
- `sphereImpostorShadow` (variable) — api/sphereImpostorShadow
- `sphereImpostorSurfaceNormal` (variable) — api/sphereImpostorSurfaceNormal

## `three-blocks/stats`

Main/worker performance-stats adapters (CPU/GPU timings, texture panels) feeding the dev overlay and the app shell's stats controllers.

- `StatsMainAdapter` (class) — api/StatsMainAdapter
- `StatsMainOptions` (interface) — api/StatsMainOptions
- `StatsMainPanelFactory` (type) — api/StatsMainPanelFactory
- `StatsMainPanelLike` (interface) — api/StatsMainPanelLike
- `StatsMainTextureSource` (interface) — api/StatsMainTextureSource
- `StatsPanelMode` (type) — api/StatsPanelMode
- `StatsProfilerData` (interface) — api/StatsProfilerData
- `StatsProfilerFactory` (type) — api/StatsProfilerFactory
- `StatsProfilerLike` (interface) — api/StatsProfilerLike
- `StatsProfilerOptions` (interface) — api/StatsProfilerOptions
- `StatsSnapshot` (interface) — api/StatsSnapshot
- `StatsTextureFrame` (interface) — api/StatsTextureFrame
- `StatsTexturePanelState` (interface) — api/StatsTexturePanelState
- `StatsWorkerAdapter` (class) — api/StatsWorkerAdapter
- `StatsWorkerOptions` (interface) — api/StatsWorkerOptions
- `createStatsMain` (function) — api/createStatsMain
- `createStatsWorker` (function) — api/createStatsWorker

## `three-blocks/surface-sampling`

Populate static, skinned, or GPU-deformed surfaces without reading instance transforms back to the CPU.

- `ComputeBVHSampler` (variable) — api/ComputeBVHSampler
- `ComputeBVHSamplerComputeOptions` (interface) — api/ComputeBVHSamplerComputeOptions
- `ComputeBVHSamplerOptions` (interface) — api/ComputeBVHSamplerOptions
- `ComputeBVHSamplerSource` (interface) — api/ComputeBVHSamplerSource
- `ComputeBVHSamplerStrategy` (type) — api/ComputeBVHSamplerStrategy
- `ComputeMeshDynamicSurfaceSampler` (variable) — api/ComputeMeshDynamicSurfaceSampler
- `ComputeMeshDynamicSurfaceSamplerComputeOptions` (interface) — api/ComputeMeshDynamicSurfaceSamplerComputeOptions
- `ComputeMeshDynamicSurfaceSamplerOptions` (interface) — api/ComputeMeshDynamicSurfaceSamplerOptions
- `ComputeMeshDynamicSurfaceSamplerOutputs` (interface) — api/ComputeMeshDynamicSurfaceSamplerOutputs
- `ComputeMeshDynamicSurfaceSamplerReadback` (interface) — api/ComputeMeshDynamicSurfaceSamplerReadback
- `ComputeMeshSurfaceSampler` (variable) — api/ComputeMeshSurfaceSampler
- `ComputeMeshSurfaceSamplerComputeOptions` (interface) — api/ComputeMeshSurfaceSamplerComputeOptions
- `ComputeMeshSurfaceSamplerOptions` (interface) — api/ComputeMeshSurfaceSamplerOptions

## `three-blocks/text`

Shared text-runtime contracts: configuration, sync batch/delivery types, font sources, and schema guards used on both sides of the worker boundary.

- `BuiltinTextFontSource` (interface) — api/BuiltinTextFontSource
- `MissingGlyphDiagnostic` (interface) — api/MissingGlyphDiagnostic
- `PackageTextFontSource` (interface) — api/PackageTextFontSource
- `ProjectTextFontSource` (interface) — api/ProjectTextFontSource
- `TEXT_SCHEMA_VERSION` (variable) — api/TEXT_SCHEMA_VERSION
- `TextBridgeEvents` (interface) — api/TextBridgeEvents
- `TextBridgeState` (interface) — api/TextBridgeState
- `TextCanvasRect` (interface) — api/TextCanvasRect
- `TextComputedStyle` (interface) — api/TextComputedStyle
- `TextConfiguration` (interface) — api/TextConfiguration
- `TextContentValue` (type) — api/TextContentValue
- `TextCreateUpdate` (interface) — api/TextCreateUpdate
- `TextElementRect` (interface) — api/TextElementRect
- `TextElementUpdate` (type) — api/TextElementUpdate
- `TextErrorState` (interface) — api/TextErrorState
- `TextFallbackSignal` (interface) — api/TextFallbackSignal
- `TextFallbackStatus` (type) — api/TextFallbackStatus
- `TextFontRoute` (interface) — api/TextFontRoute
- `TextFontSource` (type) — api/TextFontSource
- `TextFontWeightVariant` (interface) — api/TextFontWeightVariant
- `TextGenerationOptions` (interface) — api/TextGenerationOptions
- `TextLineBox` (interface) — api/TextLineBox
- `TextReadyState` (interface) — api/TextReadyState
- `TextRectUpdate` (interface) — api/TextRectUpdate
- `TextRemoveUpdate` (interface) — api/TextRemoveUpdate
- `TextSyncBatch` (interface) — api/TextSyncBatch
- `TextSyncDelivery` (interface) — api/TextSyncDelivery
- `TextUnicodePreset` (type) — api/TextUnicodePreset
- `TextUnicodeRange` (interface) — api/TextUnicodeRange
- `TextVisibilityUpdate` (interface) — api/TextVisibilityUpdate
- `assertTextSyncBatch` (function) — api/assertTextSyncBatch
- `assertTextSyncDelivery` (function) — api/assertTextSyncDelivery
- `defineText` (function) — api/defineText
- `defineTextContent` (function) — api/defineTextContent
- `isTextSyncBatch` (function) — api/isTextSyncBatch
- `isTextSyncDelivery` (function) — api/isTextSyncDelivery

## `three-blocks/text/main`

Page-side text sync: observes DOM text and publishes layout and content deliveries to the worker text renderer.

- `TextSync` (class) — api/TextSync
- `TextSyncEnvironment` (interface) — api/TextSyncEnvironment
- `TextSyncOptions` (interface) — api/TextSyncOptions
- `TextSyncPublisher` (type) — api/TextSyncPublisher
- `createTextSync` (function) — api/createTextSync

## `three-blocks/text/worker`

Worker-side text renderer: loads fonts, builds text batches, and applies page deliveries inside the render worker.

- `CreateTextBatchOptions` (interface) — api/CreateTextBatchOptions
- `LoadedTextFont` (interface) — api/LoadedTextFont
- `TextBatch` (interface) — api/TextBatch
- `TextFontLoadContext` (interface) — api/TextFontLoadContext
- `TextFontLoader` (type) — api/TextFontLoader
- `TextFontMetrics` (interface) — api/TextFontMetrics
- `TextRenderer` (class) — api/TextRenderer
- `TextRendererOptions` (interface) — api/TextRendererOptions
- `TextScene` (interface) — api/TextScene
- `TextTexture` (interface) — api/TextTexture
- `createTextRenderer` (function) — api/createTextRenderer

## `three-blocks/transmission`

Render controllable refractive depth for glass and translucent product surfaces with an explicit quality cost.

- `MeshTransmissionDitherAnchor` (type) — api/MeshTransmissionDitherAnchor
- `MeshTransmissionNodeMaterial` (variable) — api/MeshTransmissionNodeMaterial
- `MeshTransmissionNodeMaterialOptions` (type) — api/MeshTransmissionNodeMaterialOptions
- `MeshTransmissionRefractionMode` (type) — api/MeshTransmissionRefractionMode
- `MeshTransmissionViewportBufferNode` (type) — api/MeshTransmissionViewportBufferNode

## `three-blocks/vite`

The Vite plugin: shader precompile capture, codec and asset wiring, dev status overlay, build receipts, and project inspection.

- `InspectThreeBlocksProjectOptions` (interface) — api/InspectThreeBlocksProjectOptions
- `THREE_BLOCKS_CLIENT_CONFIG_ID` (variable) — api/THREE_BLOCKS_CLIENT_CONFIG_ID
- `THREE_BLOCKS_SUPPORTED_THREE_RANGE` (variable) — api/THREE_BLOCKS_SUPPORTED_THREE_RANGE
- `THREE_BLOCKS_THREE_CAPTURE_TRANSFORM_VERSION` (variable) — api/THREE_BLOCKS_THREE_CAPTURE_TRANSFORM_VERSION
- `THREE_BLOCKS_THREE_CODEC_TRANSFORM_VERSION` (variable) — api/THREE_BLOCKS_THREE_CODEC_TRANSFORM_VERSION
- `THREE_BLOCKS_THREE_HOOK_TRANSFORM_VERSION` (variable) — api/THREE_BLOCKS_THREE_HOOK_TRANSFORM_VERSION
- `THREE_BLOCKS_THREE_R186_HOOK_TRANSFORM_VERSION` (variable) — api/THREE_BLOCKS_THREE_R186_HOOK_TRANSFORM_VERSION
- `THREE_BLOCKS_VITE_SCHEMA_VERSION` (variable) — api/THREE_BLOCKS_VITE_SCHEMA_VERSION
- `ThreeBlocksAssetBuildConfig` (interface) — api/ThreeBlocksAssetBuildConfig
- `ThreeBlocksAssetReceipt` (interface) — api/ThreeBlocksAssetReceipt
- `ThreeBlocksBuildReceipt` (interface) — api/ThreeBlocksBuildReceipt
- `ThreeBlocksClientConfig` (interface) — api/ThreeBlocksClientConfig
- `ThreeBlocksCodecOptions` (interface) — api/ThreeBlocksCodecOptions
- `ThreeBlocksCodecRuntimeConfig` (interface) — api/ThreeBlocksCodecRuntimeConfig
- `ThreeBlocksDracoRuntime` (interface) — api/ThreeBlocksDracoRuntime
- `ThreeBlocksKtx2Runtime` (interface) — api/ThreeBlocksKtx2Runtime
- `ThreeBlocksMeshoptDecoder` (interface) — api/ThreeBlocksMeshoptDecoder
- `ThreeBlocksMeshoptRuntime` (interface) — api/ThreeBlocksMeshoptRuntime
- `ThreeBlocksOverlayOptions` (interface) — api/ThreeBlocksOverlayOptions
- `ThreeBlocksOverlayPosition` (type) — api/ThreeBlocksOverlayPosition
- `ThreeBlocksProjectInspection` (interface) — api/ThreeBlocksProjectInspection
- `ThreeBlocksReceiptOptions` (interface) — api/ThreeBlocksReceiptOptions
- `ThreeBlocksRendererOptions` (interface) — api/ThreeBlocksRendererOptions
- `ThreeBlocksRendererReceipt` (interface) — api/ThreeBlocksRendererReceipt
- `ThreeBlocksShaderBuildConfig` (interface) — api/ThreeBlocksShaderBuildConfig
- `ThreeBlocksShaderCaptureBuildConfig` (interface) — api/ThreeBlocksShaderCaptureBuildConfig
- `ThreeBlocksShaderInspection` (interface) — api/ThreeBlocksShaderInspection
- `ThreeBlocksShaderOptions` (interface) — api/ThreeBlocksShaderOptions
- `ThreeBlocksShaderReceipt` (interface) — api/ThreeBlocksShaderReceipt
- `ThreeBlocksShaderRefreshResult` (interface) — api/ThreeBlocksShaderRefreshResult
- `ThreeBlocksShaderSceneBuildConfig` (interface) — api/ThreeBlocksShaderSceneBuildConfig
- `ThreeBlocksShaderState` (type) — api/ThreeBlocksShaderState
- `ThreeBlocksShaderTiming` (interface) — api/ThreeBlocksShaderTiming
- `ThreeBlocksShaderVerification` (interface; deprecated compatibility — Read-only/input compatibility for timing captured before schema version 3.) — api/ThreeBlocksShaderVerification
- `ThreeBlocksStatsBuildConfig` (interface) — api/ThreeBlocksStatsBuildConfig
- `ThreeBlocksStatsOptions` (interface) — api/ThreeBlocksStatsOptions
- `ThreeBlocksTextBuildConfig` (interface) — api/ThreeBlocksTextBuildConfig
- `ThreeBlocksTextInspection` (interface) — api/ThreeBlocksTextInspection
- `ThreeBlocksTextOptions` (interface) — api/ThreeBlocksTextOptions
- `ThreeBlocksTextReceipt` (interface) — api/ThreeBlocksTextReceipt
- `ThreeBlocksTextState` (type) — api/ThreeBlocksTextState
- `ThreeBlocksViteCommand` (type) — api/ThreeBlocksViteCommand
- `ThreeBlocksViteError` (class) — api/ThreeBlocksViteError
- `ThreeBlocksViteErrorCode` (type) — api/ThreeBlocksViteErrorCode
- `ThreeBlocksViteOptions` (interface) — api/ThreeBlocksViteOptions
- `ThreeBlocksVitePlugin` (type) — api/ThreeBlocksVitePlugin
- `ThreeBlocksVitePluginApi` (interface) — api/ThreeBlocksVitePluginApi
- `ThreeCaptureInstrumentationResult` (interface) — api/ThreeCaptureInstrumentationResult
- `ThreeCodecLoaderTransformResult` (interface) — api/ThreeCodecLoaderTransformResult
- `ThreeProviderHookTransformResult` (interface) — api/ThreeProviderHookTransformResult
- `default` (function) — api/default
- `formatThreeBlocksBuildReceipt` (function) — api/formatThreeBlocksBuildReceipt
- `inspectThreeBlocksProject` (function) — api/inspectThreeBlocksProject
- `isSupportedThreeVersion` (function) — api/isSupportedThreeVersion
- `shimKtx2WorkerBodyForTests` (variable) — api/shimKtx2WorkerBodyForTests
- `threeBlocks` (function) — api/threeBlocks
- `transformThreeCodecLoaderUrls` (function) — api/transformThreeCodecLoaderUrls
- `transformThreeCoreShaderInputs` (function) — api/transformThreeCoreShaderInputs
- `transformThreeWebgpuCaptureInstrumentation` (function) — api/transformThreeWebgpuCaptureInstrumentation
- `transformThreeWebgpuProviderHooks` (function) — api/transformThreeWebgpuProviderHooks

## `three-blocks/vite/config`

Type declarations for the plugin-injected virtual client config (`threeBlocksConfig`, codec runtimes, build receipts).

- `THREE_BLOCKS_VITE_SCHEMA_VERSION` (variable) — api/THREE_BLOCKS_VITE_SCHEMA_VERSION
- `ThreeBlocksAssetBuildConfig` (interface) — api/ThreeBlocksAssetBuildConfig
- `ThreeBlocksAssetReceipt` (interface) — api/ThreeBlocksAssetReceipt
- `ThreeBlocksBuildReceipt` (interface) — api/ThreeBlocksBuildReceipt
- `ThreeBlocksClientConfig` (interface) — api/ThreeBlocksClientConfig
- `ThreeBlocksCodecRuntimeConfig` (interface) — api/ThreeBlocksCodecRuntimeConfig
- `ThreeBlocksDracoRuntime` (interface) — api/ThreeBlocksDracoRuntime
- `ThreeBlocksKtx2Runtime` (interface) — api/ThreeBlocksKtx2Runtime
- `ThreeBlocksMeshoptDecoder` (interface) — api/ThreeBlocksMeshoptDecoder
- `ThreeBlocksMeshoptRuntime` (interface) — api/ThreeBlocksMeshoptRuntime
- `ThreeBlocksRendererReceipt` (interface) — api/ThreeBlocksRendererReceipt
- `ThreeBlocksShaderBuildConfig` (interface) — api/ThreeBlocksShaderBuildConfig
- `ThreeBlocksShaderCaptureBuildConfig` (interface) — api/ThreeBlocksShaderCaptureBuildConfig
- `ThreeBlocksShaderReceipt` (interface) — api/ThreeBlocksShaderReceipt
- `ThreeBlocksShaderSceneBuildConfig` (interface) — api/ThreeBlocksShaderSceneBuildConfig
- `ThreeBlocksShaderState` (type) — api/ThreeBlocksShaderState
- `ThreeBlocksShaderTiming` (interface) — api/ThreeBlocksShaderTiming
- `ThreeBlocksShaderVerification` (interface; deprecated compatibility — Read-only/input compatibility for timing captured before schema version 3.) — api/ThreeBlocksShaderVerification
- `ThreeBlocksStatsBuildConfig` (interface) — api/ThreeBlocksStatsBuildConfig
- `ThreeBlocksTextBuildConfig` (interface) — api/ThreeBlocksTextBuildConfig
- `ThreeBlocksTextReceipt` (interface) — api/ThreeBlocksTextReceipt
- `ThreeBlocksTextState` (type) — api/ThreeBlocksTextState
- `ThreeBlocksViteCommand` (type) — api/ThreeBlocksViteCommand
- `loadThreeBlocksMeshoptDecoder` (function) — api/loadThreeBlocksMeshoptDecoder
- `threeBlocksAssets` (variable) — api/threeBlocksAssets
- `threeBlocksBuildReceipt` (variable) — api/threeBlocksBuildReceipt--case-74-68-72-65-65-42-6c-6f-63-6b-73-42-75-69-6c-64-52-65-63-65-69-70-74
- `threeBlocksCapture` (variable) — api/threeBlocksCapture
- `threeBlocksConfig` (variable) — api/threeBlocksConfig
- `threeBlocksDevelopment` (variable) — api/threeBlocksDevelopment
- `threeBlocksShaders` (variable) — api/threeBlocksShaders
- `threeBlocksStats` (variable) — api/threeBlocksStats
- `threeBlocksText` (variable) — api/threeBlocksText

## `three-blocks/water`

Simulate and render interactive water from particle volume through surface or raymarched presentation.

- `ComputeSphereRasterizer` (class) — api/ComputeSphereRasterizer
- `WATER_RAYMARCH_QUALITY_PRESETS` (variable) — api/WATER_RAYMARCH_QUALITY_PRESETS
- `WaterCaustics` (class) — api/WaterCaustics
- `WaterFoamMeshOptions` (interface) — api/WaterFoamMeshOptions
- `WaterFoamOptions` (interface) — api/WaterFoamOptions
- `WaterMaterialSSROptions` (interface) — api/WaterMaterialSSROptions
- `WaterMaterialUniformOptions` (interface) — api/WaterMaterialUniformOptions
- `WaterNodeMaterial` (variable) — api/WaterNodeMaterial
- `WaterNodeMaterialOptions` (interface) — api/WaterNodeMaterialOptions
- `WaterPreset` (type) — api/WaterPreset
- `WaterRayMarchQualityOverrides` (interface) — api/WaterRayMarchQualityOverrides
- `WaterRayMarchQualityPreset` (type) — api/WaterRayMarchQualityPreset
- `WaterRayMarchQualitySettings` (interface) — api/WaterRayMarchQualitySettings
- `WaterRayMarchQualitySnapshot` (interface) — api/WaterRayMarchQualitySnapshot
- `WaterRayMarchReflectionSteps` (type) — api/WaterRayMarchReflectionSteps
- `WaterRayMarchRenderer` (variable) — api/WaterRayMarchRenderer
- `WaterRayMarchRendererOptions` (interface) — api/WaterRayMarchRendererOptions
- `WaterRayMarchScatterSamples` (type) — api/WaterRayMarchScatterSamples
- `WaterRayMarchTraceOptions` (interface) — api/WaterRayMarchTraceOptions
- `WaterSurfaceCamera` (interface) — api/WaterSurfaceCamera
- `WaterSurfaceFieldOptions` (interface) — api/WaterSurfaceFieldOptions
- `WaterSurfaceFoamMeshOptions` (interface) — api/WaterSurfaceFoamMeshOptions
- `WaterSurfaceRenderer` (variable) — api/WaterSurfaceRenderer
- `WaterSurfaceRendererOptions` (interface) — api/WaterSurfaceRendererOptions
- `WaterVolume` (variable) — api/WaterVolume
- `WaterVolumeBoundaryMode` (type) — api/WaterVolumeBoundaryMode
- `WaterVolumeBoundaryOptions` (interface) — api/WaterVolumeBoundaryOptions
- `WaterVolumeDomainBindingOptions` (interface) — api/WaterVolumeDomainBindingOptions
- `WaterVolumeInteractionOptions` (interface) — api/WaterVolumeInteractionOptions
- `WaterVolumeLattice` (interface) — api/WaterVolumeLattice
- `WaterVolumeMaterialOptions` (interface) — api/WaterVolumeMaterialOptions
- `WaterVolumeOptions` (interface) — api/WaterVolumeOptions
- `WaterVolumePointerOptions` (interface) — api/WaterVolumePointerOptions
- `WaterVolumeSeedOptions` (interface) — api/WaterVolumeSeedOptions
- `WaterVolumeSolverOptions` (interface) — api/WaterVolumeSolverOptions
- `WaterVolumeSplashOptions` (interface) — api/WaterVolumeSplashOptions
- `WaterVolumeStepStats` (interface) — api/WaterVolumeStepStats
- `WaterVolumeWavesOptions` (interface) — api/WaterVolumeWavesOptions
- `WaterWaveComponentOptions` (interface) — api/WaterWaveComponentOptions
- `WaterWaveDirection` (type) — api/WaterWaveDirection
- `createWaterComposite` (function) — api/createWaterComposite
- `getWaterRayMarchQualityPreset` (function) — api/getWaterRayMarchQualityPreset

## `three-blocks/worker`

Typed main↔worker transport with state, event, and RPC lanes, compile-time structured-clone checking, transferables, and endpoint replacement for restarts. Knows nothing about three.js.

- `BrowserMessageEndpoint` (interface) — api/BrowserMessageEndpoint
- `CloneValue` (type) — api/CloneValue
- `MessageEndpoint` (interface) — api/MessageEndpoint
- `MessageEndpointListener` (type) — api/MessageEndpointListener
- `MessageEndpointSource` (type) — api/MessageEndpointSource
- `MessageEventLike` (interface) — api/MessageEventLike
- `RemoteWorkerError` (class) — api/RemoteWorkerError
- `RequestDefinition` (interface) — api/RequestDefinition
- `RequestParameters` (type) — api/RequestParameters
- `RequestResult` (type) — api/RequestResult
- `SendOptions` (interface) — api/SendOptions
- `SerializeWorkerErrorOptions` (interface) — api/SerializeWorkerErrorOptions
- `SerializedWorkerError` (interface) — api/SerializedWorkerError
- `StructuredCloneBuiltin` (type) — api/StructuredCloneBuiltin
- `StructuredClonePrimitive` (type) — api/StructuredClonePrimitive
- `StructuredCloneable` (type) — api/StructuredCloneable
- `StructuredCloneableShape` (type) — api/StructuredCloneableShape
- `TransferableValue` (type) — api/TransferableValue
- `WORKER_PROTOCOL_VERSION` (variable) — api/WORKER_PROTOCOL_VERSION
- `WorkerClient` (class) — api/WorkerClient
- `WorkerClientOptions` (interface) — api/WorkerClientOptions
- `WorkerEventHandlerContext` (interface) — api/WorkerEventHandlerContext
- `WorkerEventHandlers` (type) — api/WorkerEventHandlers
- `WorkerEventLane` (interface) — api/WorkerEventLane
- `WorkerHandlerContext` (interface) — api/WorkerHandlerContext
- `WorkerLifecyclePhase` (type) — api/WorkerLifecyclePhase
- `WorkerRequestHandlerContext` (interface) — api/WorkerRequestHandlerContext
- `WorkerRequestHandlers` (type) — api/WorkerRequestHandlers
- `WorkerRpcLane` (interface) — api/WorkerRpcLane
- `WorkerServer` (class) — api/WorkerServer
- `WorkerServerHandlers` (interface) — api/WorkerServerHandlers
- `WorkerServerOptions` (interface) — api/WorkerServerOptions
- `WorkerStateHandlerContext` (interface) — api/WorkerStateHandlerContext
- `WorkerStateHandlers` (type) — api/WorkerStateHandlers
- `WorkerStateLane` (interface) — api/WorkerStateLane
- `WorkerTransfer` (class) — api/WorkerTransfer
- `WorkerTransportError` (class) — api/WorkerTransportError
- `WorkerTransportErrorCode` (type) — api/WorkerTransportErrorCode
- `asTransferable` (function) — api/asTransferable
- `createWorkerClient` (function) — api/createWorkerClient
- `createWorkerServer` (function) — api/createWorkerServer
- `messageEndpoint` (function) — api/messageEndpoint--case-6d-65-73-73-61-67-65-45-6e-64-70-6f-69-6e-74
- `serializeWorkerError` (function) — api/serializeWorkerError
- `withTransfer` (function) — api/withTransfer

