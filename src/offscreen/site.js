import "@/offscreen/main";
import { store, useViewportStore } from "@/offscreen/store";
import virtualElement from "@/offscreen/dispatcher/helpers/virtualElement";
import { component } from "@/offscreen/dispatcher";
import { raf } from "@/offscreen/dispatcher/helpers/raf";
import debugInfos from "@/offscreen/utils/debugInfos";
import { prepareScenes } from "@/offscreen/utils/prepareScenes";
import { ENABLE_ADAPTIVE_RESOLUTION } from "@/shared/flags";
import { AdaptiveResolution } from "@/offscreen/utils/AdaptiveResolution";
import loader from "@/offscreen/loader";
import dispatcher from "@/shared/dispatcher";

// init events
import "@/offscreen/dispatcher";

// Managers
import { SceneManager, TransitionManager } from "@/offscreen/managers";

// Scenes
import PersistentScene from "@/offscreen/scenes/PersistentScene";
import MeadowScene from "@/offscreen/scenes/MeadowScene";

import IceScene from "@/offscreen/scenes/IceScene";
import CubeScene from "@/offscreen/scenes/CubeScene";
import ProjectScene from "@/offscreen/scenes/ProjectScene";
import AboutScene from "@/offscreen/scenes/AboutScene";
import { getFlag, getParam } from "@/offscreen/lib/query";
import { getTier } from "@/shared/tiers";
import { findProject, PROJECTS } from "@/shared/projects";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";
import { timings, selectTransitionTiming } from "@/shared/timings";
import { timingEase } from "@/offscreen/lib/customEases";

// Mouse tracker for hover controls
import { mouseTracker } from "@/offscreen/input/MouseTracker";
import { mobileSettings } from "@/shared/mobileSettings";
import {
  bindDebugParams,
  bindParamGroup,
  clearBoundParams,
} from "@/offscreen/debug/bindDebugParams";
import { params } from "@/offscreen/params";
import { attachSaveParamsButton } from "@/offscreen/debug/saveParams";
import { attachTimingsDebug } from "@/offscreen/debug/bindTimingsDebug";
import { createDebugPanel } from "@/offscreen/debug/createDebugPanel";
import { bindTransitionDebug } from "@/offscreen/transitions";
import { WorldPositionTransition } from "@/offscreen/transitions/WorldPositionTransition";
import { audio } from "@/audio/audio";

// Scene sequence. Pick a single one with ?scene=<name> (or ?scene=<index>)
const SCENE_REGISTRY = {
  // demo: DemoScene,
  // vat: VATScene,
  meadow: MeadowScene,
  cube: CubeScene,
  ice: IceScene,
};

class Site extends component(null, {
  raf: {
    renderPriority: Number.Infinity, // always render in last the loop
    fps: Number.Infinity, // no throttle to the render RAF
  },
}) {
  init({ gl, shadersReady }) {
    this.gl = gl;
    this._shadersReady = shadersReady;
    this.progressDamp = 0;
    this.resolution = ENABLE_ADAPTIVE_RESOLUTION
      ? new AdaptiveResolution()
      : null;
    if (getFlag("debug") && typeof document !== "undefined") {
      this._tier = getTier();
      this._dprReadout = document.createElement("div");
      this._dprReadout.style.cssText =
        "position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:1001;padding:4px 8px;color:#fff;background:#0008;font:12px/1 ui-monospace,monospace;pointer-events:none";
      this._dprReadout.textContent = `tier ${this._tier}`;
      document.body.appendChild(this._dprReadout);
    }
    this._startup = getFlag("skipLoader")
      ? null
      : { waiting: true, elapsed: 0 };

    debugInfos();
    store.gl = gl;

    const { camera: storeCamera } = store;

    // Initialize mouse tracker for hover controls
    mouseTracker.init();

    // Initialize orbit controls based on context
    if (typeof window !== "undefined") {
      storeCamera.initOrbitControls(gl.domElement);
    } else {
      storeCamera.initOrbitControls(virtualElement);
    }

    raf.start(gl);
  }

  onWorkerReady() {
    // Resolve the same scene list for preloading and construction. Large scene
    // assets are fetched once, and skipped by unrelated single-scene previews.
    const sceneParam = getParam("scene");
    const sceneKeys = Object.keys(SCENE_REGISTRY);
    if (sceneParam !== null) {
      const key = sceneParam.toLowerCase().replace(/scene$/, "");
      const selectedIndex =
        key in SCENE_REGISTRY ? sceneKeys.indexOf(key) : Number(sceneParam);
      const SceneClass = SCENE_REGISTRY[sceneKeys[selectedIndex]];
      if (!SceneClass)
        console.warn(
          `Unknown scene "${sceneParam}". Available: ${sceneKeys.join(", ")}`,
        );
      if (getFlag("debug") && SceneClass) {
        // Debug previews need a real adjacent scene for paused transition
        // scrubbing. Keep the requested scene first and preload the cycle;
        // production single-scene previews retain their lighter asset path.
        const orderedKeys = sceneKeys
          .slice(selectedIndex)
          .concat(sceneKeys.slice(0, selectedIndex));
        this._sceneClasses = orderedKeys.map(
          (sceneKey) => SCENE_REGISTRY[sceneKey],
        );
      } else {
        this._sceneClasses = [SceneClass ?? MeadowScene];
      }
    } else {
      this._sceneClasses = Object.values(SCENE_REGISTRY);
    }
    loader.load(
      this._sceneClasses.flatMap((SceneClass) => SceneClass.resources ?? []),
    );
  }

  onInitDebug({ gui } = {}) {
    if (getFlag("debugAnimations")) {
      attachTimingsDebug(createDebugPanel("debugAnimations"));
    }
    if (!gui) return;

    console.log("🏗️ Debug mode is enabled");
    store.debugGui = gui;
    clearBoundParams();
    attachSaveParamsButton(gui);
    const mobileRanges = {
      hoverStrength: [0, 2],
      portraitColumns: [6, 14, 1],
      portraitRows: [8, 18, 1],
      landscapeColumns: [10, 20, 1],
      landscapeRows: [5, 12, 1],
      gridWidth: [0.4, 0.95],
      gridHeight: [0.3, 0.8],
      floorDrop: [0, 10],
      tileGap: [0, 0.3],
      iceFloorDrop: [0, 4],
      portraitDensity: [0.1, 1],
      portraitDither: [0, 1],
      portraitFitHeight: [0.15, 1.2],
      portraitFitWidth: [0.15, 1.2],
      portraitOffsetX: [-0.5, 0.5, 0.005],
      portraitOffsetY: [-0.5, 0.5, 0.005],
      portraitLandscapeFitHeight: [0.15, 1.2],
      portraitLandscapeFitWidth: [0.15, 1.2],
      portraitLandscapeOffsetX: [-0.5, 0.5, 0.005],
      portraitLandscapeOffsetY: [-0.5, 0.5, 0.005],
      galleryBars: [2, 32, 1],
      galleryStagger: [0, 0.3],
      tileHoverScale: [0, 2],
    };
    bindDebugParams(
      gui,
      Object.entries(mobileRanges).map(([property, [min, max, step]]) => ({
        folder: "Mobile only",
        object: mobileSettings,
        property,
        name: property
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (letter) => letter.toUpperCase()),
        min,
        max,
        step: step ?? 0.01,
        onChange: () => {
          if (!getFlag("touchExperience")) return;
          this.persistentScene?.grid?._onViewportChange(store.viewport);
          const controller = this.sceneManager?.cameraController;
          controller?.setAspect(controller.camera.aspect);
        },
      })),
    );

    const isOffscreen = typeof window === "undefined";

    if (!isOffscreen) {
      dispatcher.trigger(
        { name: "debug", fireAtStart: true },
        {
          gui,
        },
      );
    }

    this._attachSceneDebug();
  }

  onRaf({ elapsedTime, delta }) {
    if (!this._ready) return;

    // Skip updates if device is lost
    if (this.gl && this.gl.isDeviceValid === false) return;
    if (this.resolution && !store.recording)
      this.resolution.update(self.performance.now());

    // Update mouse tracker from store pointer (for offscreen worker)
    mouseTracker.updateFromStore();

    if (this._startup) {
      this._updateStartup(delta);
      this._syncSceneInteractions();
      this._flushPageNavigation();
      this.sceneManager.render(elapsedTime * 1000, delta);
      this._syncAudioScene();
      return;
    }

    // Update transition manager with time in milliseconds
    if (this.transitionManager) {
      this.transitionManager.update(elapsedTime * 1000, delta);
      this._updateHomeReturn(delta);
      this._syncSceneEntry();
      this.persistentScene.followRoomScreen =
        this.transitionManager.phase === "transition" &&
        this.transitionManager._transitionKind === "enterPinned";
      if (
        this._pinnedKind === "project" &&
        (this.transitionManager.phase === "pinned" ||
          (this.transitionManager.transitionProgress >=
            this.persistentScene.pageTiming.projectScreenAt &&
            this.persistentScene.tilesClear))
      )
        this.persistentScene._projectMotionReady = true;
      this._holdGalleryForBackdrop();
      this._flushPageNavigation();
      this._completePageEntry();
      this._syncSceneInteractions();
      this._syncSceneTimeline();
      if (this._touchDebug) this._sendTouchDebug(elapsedTime);
    }

    // Render via scene manager (handles multi-pass GBuffer rendering)
    if (this.sceneManager) {
      this.sceneManager.render(elapsedTime * 1000, delta);
      this._syncAudioScene();
      // The main thread moves the canvas to the scroll this frame was drawn
      // at, so 3D content and native-scrolled DOM stay locked together.
      if (this._pageScrollDirty) {
        this._pageScrollDirty = false;
        dispatcher.trigger(
          { name: "pageScrollFrame" },
          { scroll: this._pageScroll },
        );
      }
    }
  }

  _activeSceneObj() {
    const manager = this.sceneManager;
    const id =
      manager.isTransitioning && manager.activeNextId !== null
        ? manager.activeNextId
        : manager.activePrevId;
    return manager.scenes.get(id)?.sceneObj ?? null;
  }

  onEnterSite({ immediate = false } = {}) {
    if (!this._ready || !this._startup?.waiting) return;
    this._startup.waiting = false;
    this._startup.immediate = immediate;
    if (!this._startup.page) {
      this.persistentScene.startHomeReturn(immediate, timings.startup);
      this.persistentScene.grid.setInteractive(true);
    }
    this._syncSceneInteractions();
  }

  _beginStartupReveal() {
    const { immediate } = this._startup;
    this._startup.revealing = true;
    if (this._startup.page) {
      this._pageEntry.immediate = immediate;
      this._pageEntry.direct = true;
      // Prepared fully revealed under the loader; enter from black instead.
      if (this._pinnedKind === "project") this.projectScene.startReveal({ immediate });
      this.persistentScene.gallery?.revealPage(immediate);
      this._completePageEntry();
    }
    this._activeSceneObj()?.onEnter?.();
  }

  _updateStartup(delta) {
    const state = this._startup;
    if (state.waiting) return;
    const step = Math.min(delta || 1 / 60, 0.05);
    state.elapsed += step;
    const { revealDelay, wipeDuration, wipeEase, visibleEnd, zoomDuration, pageFade } =
      timings.startup;
    const elapsed = state.elapsed - revealDelay;
    if (!state.immediate && elapsed < 0) return;
    if (!state.revealing) this._beginStartupReveal();
    const progress = state.immediate ? 1 : Math.min(1, elapsed / Math.max(state.page ? pageFade : wipeDuration, 1e-3));
    const zoom =
      state.immediate || state.page
        ? 1
        : Math.min(1, elapsed / Math.max(zoomDuration, 1e-3));
    if (!state.page)
      this.sceneManager.cameraController.updateIntro(zoom, step);
    const post = this.sceneManager.post.material;
    if (state.page) {
      post.startupProgress.value = 1;
      post.startupFade.value = timingEase(wipeEase)(progress);
      this._holdGalleryForBackdrop();
      this._completePageEntry();
    } else post.startupProgress.value = timingEase(wipeEase)(progress);
    const end = state.page ? 1 : Math.min(Math.max(visibleEnd, 0.01), 1);
    const contentReady =
      state.page || this.persistentScene.updateHomeReturn(step, end);
    if (progress < end || zoom < 1 || !contentReady) return;
    post.startupProgress.value = 1;
    post.startupFade.value = 1;
    if (!state.page) {
      this.persistentScene.finishHomeReturn();
      this.transitionManager.start(performance.now() - raf.startTime);
      this.transitionManager.lastNow = this.transitionManager.t0;
    }
    this._startup = null;
    this._flushPageNavigation();
  }

  _holdGalleryForBackdrop() {
    if (this.persistentScene.gallery)
      this.persistentScene.gallery.entryHeld = !this.projectScene.galleryReleased;
  }

  _gridOwnsPointer() {
    return Boolean(this.persistentScene?.grid?.containsPointer());
  }

  _syncSceneEntry() {
    const active = this._activeSceneObj();
    if (!active || active === this._enteredScene) return;
    this._enteredScene = active;
    active.onEnter?.();
  }

  _syncSceneInteractions() {
    if (getFlag("touchExperience")) {
      const enabled =
        !this._pinnedKind &&
        !this._startup?.waiting &&
        !this._homeReturn &&
        this.persistentScene.grid.interactive;
      if (enabled !== this._touchControlsEnabled) {
        this._touchControlsEnabled = enabled;
        dispatcher.trigger({ name: "touchControls" }, { enabled });
      }
    }
    const interactiveId = this.transitionManager?.interactionSceneId;
    const active =
      interactiveId == null
        ? null
        : (this.sceneManager.scenes.get(interactiveId)?.sceneObj ?? null);
    const enabled =
      !this._pinnedKind &&
      !this._startup &&
      !this._homeReturn &&
      Boolean(this.transitionManager?.canInteract) &&
      !this._gridOwnsPointer();
    for (const scene of this.sceneInstances ?? [])
      scene.setInteractionEnabled?.(enabled && scene === active);
  }

  /**
   * Main-thread scene switcher: sent only when the cycle state changes. The
   * bar animates itself from `remaining`, so no per-frame messages are needed.
   * One bar spans a scene's time on screen: from the moment the wipe shows it
   * (`switcherFlipAt`) until the next wipe reaches the same point.
   */
  _syncSceneTimeline() {
    const tm = this.transitionManager;
    const cycling = tm.phase === "transition" && !tm._transitionKind;
    const state =
      this._pinnedKind || this._homeReturn
        ? "hidden"
        : cycling
          ? "transition"
          : tm.phase === "idle"
            ? "idle"
            : "hold";
    const flipAt = timings.world.switcherFlipAt;
    const flipped = cycling && tm.transitionProgress >= Math.min(flipAt, timings.world.visibleEnd);
    const index = flipped ? tm.nextIdx : tm.prevIdx;
    const last = this._timeline;
    if (last.state === state && last.index === index && last.t0 === tm.t0)
      return;
    last.state = state;
    last.index = index;
    last.t0 = tm.t0;
    const idleMs = timings.world.idle * 1000;
    const elapsed = tm.lastNow - tm.t0;
    const toFlip = tm.transitionMs * Math.min(flipAt, timings.world.visibleEnd);
    const remaining =
      state === "idle"
        ? idleMs - elapsed + toFlip
        : flipped
          ? tm.transitionMs * timings.world.visibleEnd - elapsed + idleMs + toFlip
          : state === "transition"
            ? toFlip - elapsed
            : 0;
    dispatcher.trigger(
      { name: "sceneTimeline" },
      {
        state,
        index,
        names: this._sceneNames,
        autoAdvance: tm.autoAdvance,
        remaining: Math.max(0, remaining),
      },
    );
  }

  /** `?debugTouch`: worker half of the on-screen touch diagnostics. */
  _sendTouchDebug(now) {
    if (now - (this._touchDebugAt ?? -1) < 0.25) return;
    this._touchDebugAt = now;
    const grid = this.persistentScene.grid;
    const u = grid.compute?.uniforms;
    const round = (value) => Math.round(value * 100) / 100;
    dispatcher.trigger(
      { name: "touchDebug" },
      {
        pinned: this._pinnedKind,
        siteReturn: this._homeReturn?.stage ?? null,
        sceneReturn: this.persistentScene._homeReturn?.stage ?? null,
        startup: Boolean(this._startup),
        phase: this.transitionManager.phase,
        controls: this._touchControlsEnabled,
        interactive: grid.interactive,
        meshVisible: grid.mesh?.visible,
        hide: round(u?.hideProgress.value ?? -1),
        hover: u?.hasHover.value,
        tile: u ? `${u.pointerTile.value.x},${u.pointerTile.value.y}` : null,
        pointer: `${round(store.pointer.x)},${round(store.pointer.y)}`,
        viewport: `${store.viewport?.width}x${store.viewport?.height}`,
      },
    );
  }

  onSceneStep({ step }) {
    const tm = this.transitionManager;
    if (!tm || this._pinnedKind || this._homeReturn || tm.phase !== "idle")
      return;
    tm.transitionTo(tm.prevIdx + step);
  }

  /** Pinned pages map to `project` / `about`; during a cycle the incoming scene wins. */
  _syncAudioScene() {
    const name =
      this._pinnedKind ??
      this._activeSceneObj()
        ?.name?.toLowerCase()
        .replace(/scene$/, "");
    if (!name || name === this._audioScene) return;
    this._audioScene = name;
    audio.setScene(name);
  }

  onProjectVideoFrame(data) {
    this.persistentScene?.setProjectVideoFrame(data);
  }

  onPageScroll({ scroll = 0, viewportHeight = 1 }) {
    this._pageScroll = scroll;
    this._pageScrollDirty = true;
    const scene =
      this._pinnedKind === "project" ? this.projectScene : this.aboutScene;
    // Outgoing DOM cleanup must not rewind a background during a page swap.
    if (!this._pageSwitch) scene?.setPageScroll(scroll, viewportHeight);
    if (this._pinnedKind === "project")
      this.persistentScene.setProjectScroll(scroll);
  }

  onProjectGallery({
    slug,
    step,
    index,
    activate,
    delay,
    immediate,
    phase,
    distance,
    velocity,
    stills,
    revealStill,
  }) {
    const gallery = this.persistentScene?.gallery;
    if (this._pinnedKind !== "project" || gallery?.project.slug !== slug)
      return;
    if (activate) gallery.activate(immediate, delay);
    else if (stills) gallery.setStills(stills);
    else if (revealStill !== undefined)
      gallery.revealStill(revealStill, immediate);
    else gallery.change({ step, index, immediate, phase, distance, velocity });
  }

  onNavigatePage(route) {
    // Last request wins, including requests arriving during a GPU transition.
    this._requestedPage = route;
    this._flushPageNavigation();
  }

  onPageContentExited({ revision }) {
    this._contentExitedRevision = Math.max(
      this._contentExitedRevision ?? 0,
      revision,
    );
  }

  _beginHomeReturn(route) {
    this._pageEntry = null;
    const state = (this._homeReturn = {
      ...route,
      stage: "content",
      gpuReady: false,
    });
    this.persistentScene.prepareHomeReturn();
    if (this._pinnedKind === "project")
      this.projectScene.hideReveal({ immediate: route.immediate });
    const exit =
      this._pinnedKind === "about"
        ? this.aboutScene.hidePage(route.immediate)
        : this.persistentScene.gallery?.hidePage(route.immediate);
    Promise.resolve(exit).then(() => {
      state.gpuReady = true;
    });
  }

  _updateHomeReturn(delta) {
    const state = this._homeReturn;
    if (!state) return;
    if (state.stage === "content") {
      if (
        !state.gpuReady ||
        (state.waitForContent &&
          (this._contentExitedRevision ?? 0) < state.revision)
      )
        return;
      if (!this.transitionManager.exitPinned({ immediate: state.immediate }))
        return;
      this.persistentScene.startHomeReturn(state.immediate);
      this._pinnedKind = this._projectSlug = null;
      state.stage = "reveal";
    }
    const ready = this.persistentScene.updateHomeReturn(delta);
    if (!ready || this.transitionManager.phase === "transition") return;
    this.persistentScene.finishHomeReturn();
    this.transitionManager.finishHomeReturn();
    this._restorePageControls();
    this._homeReturn = null;
    dispatcher.trigger({ name: "pageClosed" }, {});
  }

  _flushPageNavigation() {
    const route = this._requestedPage;
    if (
      !route ||
      !this.transitionManager ||
      this._pageSwitch ||
      this._homeReturn
    )
      return;
    if (this._startup) {
      // Accept tile clicks and prepare their media, but preserve the reveal.
      // The initial home route also passes here; it must never skip the wipe.
      if (
        !this._startup.waiting &&
        !this._startup.page &&
        route.kind === "project"
      )
        this._isPagePrepared(route);
      return;
    }
    if (!this.transitionManager.preparePageEntry()) return;
    const matches =
      route.kind === this._pinnedKind &&
      (route.kind !== "project" || route.slug === this._projectSlug);
    if (matches) {
      this._requestedPage = null;
      dispatcher.trigger(
        { name: route.kind === "about" ? "aboutOpened" : "projectOpened" },
        route.kind === "project" ? { slug: route.slug } : {},
      );
      return;
    }
    if (route.kind === "project" && !this._isPagePrepared(route)) return;
    selectTransitionTiming(this._pinnedKind || "home", route.kind);
    this._pagePreparation = null;
    this._setPageLoading(false);
    if (this._pinnedKind) {
      if (
        route.kind === "about" ||
        (route.kind === "project" && findProject(route.slug))
      ) {
        this._requestedPage = null;
        this._pageSwitch = this._switchPinnedPage(route).finally(() => {
          this._pageSwitch = null;
        });
        return;
      }
      this._requestedPage = null;
      this._beginHomeReturn(route);
      return;
    }
    this.aboutScene.setPageScroll(0);
    this.projectScene.resetPageScroll();
    this._requestedPage = null;
    if (route.kind === "about")
      this._openAbout({ immediate: !this._ready || route.immediate });
    else if (route.kind === "project")
      this._openProject(findProject(route.slug), {
        immediate: !this._ready || route.immediate,
      });
    else dispatcher.trigger({ name: "pageClosed" }, {});
  }

  // Page transitions only start once their content is uploaded and compiled.
  _isPagePrepared(route) {
    const project = findProject(route.slug);
    if (!project) return true;
    const previous = this._pagePreparation;
    if (
      previous?.slug === project.slug &&
      (!previous.done ||
        this.persistentScene._preparedGallery?.project === project)
    )
      return previous.done;
    const preparation = (this._pagePreparation = {
      slug: project.slug,
      done: false,
    });
    const current = () =>
      this._pagePreparation === preparation && !preparation.done;
    const indicator = setTimeout(
      () => current() && this._setPageLoading(true),
      timings.pageLoader.delay * 1000,
    );
    Promise.all([
      this.persistentScene.prepareProject(project),
      !this._pinnedKind && this.persistentScene.prepareProjectVideo(project),
    ]).finally(() => {
      clearTimeout(indicator);
      if (!current()) return;
      preparation.done = true;
      this._setPageLoading(false);
    });
    return false;
  }

  _setPageLoading(loading) {
    if (this._pageLoading === loading) return;
    this._pageLoading = loading;
    dispatcher.trigger({ name: "pageLoading" }, { loading });
  }

  onDeviceLost({ reason, message }) {
    console.warn(
      `WebGPU device lost in Site: ${message || reason || "unknown"}`,
    );
  }

  onDeviceRestored() {
    console.log("WebGPU device restored - resuming rendering");
  }

  onResize(size) {
    const { width, height, dpr } = size;
    if (this.resolution && !size.adaptive) this.resolution.setBase(size);
    if (this._dprReadout)
      this._dprReadout.textContent = `tier ${this._tier} · DPR ${dpr}`;
    // Update viewport store
    useViewportStore.setViewport({
      width,
      height,
      devicePixelRatio: dpr,
    });

    // Resize scene manager (handles gbuffers, persistent scene, etc.)
    if (this.sceneManager) {
      this.sceneManager.resize({
        width,
        height,
        devicePixelRatio: dpr,
      });
    }
  }

  onDebug() {}

  _attachSceneDebug() {
    const gui = store.debugGui;
    if (!gui || !this.sceneInstances) return;

    bindParamGroup(
      gui,
      params.Rendering,
      (key) =>
        key === "antialias" && {
          object: this.sceneManager,
          property: "antialias",
          onChange: () =>
            this.sceneManager.setAntialias(this.sceneManager.antialias),
        },
      "Rendering",
    );

    // Put scene controls first so they aren't buried beneath the grid controls.
    for (const inst of this.sceneInstances) {
      inst.attachDebug?.(gui, { sceneManager: this.sceneManager });
    }

    bindTransitionDebug(gui, {
      onNextScene: () => this.transitionManager?.next(),
    });

    this.persistentScene?.attachDebug?.(gui);
    this.projectScene?.attachDebug?.(gui);
    this.aboutScene?.attachDebug?.(gui);
  }

  /**
   * Canvas click: open the project of the active tile under the pointer.
   * Same world-position transition as scene cycling; the TransitionManager
   * pins the project scene while the persistent grid scales its tiles out.
   */
  onClick() {
    const gridOwnsPointer = this._gridOwnsPointer();
    const project = gridOwnsPointer
      ? this.persistentScene?.hoveredProject
      : null;
    if (project) {
      this.onNavigatePage({ kind: "project", slug: project.slug });
      return;
    }
    if (gridOwnsPointer) return;
    if (
      !this._startup &&
      !this._pinnedKind &&
      this.sceneManager &&
      this.transitionManager?.canInteract
    )
      this.sceneManager.scenes
        .get(this.transitionManager.interactionSceneId)
        ?.sceneObj?.onPointerClick?.();
  }

  _openProject(project, { immediate = false } = {}) {
    if (!project || !this.transitionManager) return;

    const started = this.transitionManager.enterPinned(
      this.projectSceneId,
      this.projectScene,
      {
        immediate,
        delay: this.persistentScene.pageTiming.pageWipeDelay,
        duration: this.persistentScene.pageTiming.projectWipeDuration,
      },
    );
    if (!started) return;
    this._pinnedKind = "project";
    this._projectSlug = project.slug;
    this._disablePageControls();

    this.persistentScene.enterProject(project, { immediate });
    const pageTiming = this.persistentScene.pageTiming;
    this.projectScene.startReveal({
      immediate,
      delay:
        pageTiming.pageWipeDelay +
        pageTiming.projectWipeDuration * timings.projectSky.revealAt,
    });

    // Main thread updates the route to /project/<slug>
    this._pageEntry = { kind: "project", slug: project.slug, immediate };
    this._completePageEntry();
  }

  _openAbout({ immediate = false } = {}) {
    if (
      !this.transitionManager ||
      this.transitionManager.phase === "transition" ||
      this.transitionManager.pinnedId !== null
    )
      return;
    this.aboutScene.prepareReveal();

    const started = this.transitionManager.enterPinned(
      this.aboutSceneId,
      this.aboutScene,
      {
        immediate,
        delay: this.persistentScene.pageTiming.pageWipeDelay,
        duration: this.persistentScene.pageTiming.aboutWipeDuration,
      },
    );
    if (!started) return;
    this._pinnedKind = "about";
    this._disablePageControls();

    this.persistentScene.enterAbout({ immediate });
    this._pageEntry = { kind: "about", immediate };
    this._completePageEntry();
  }

  _completePageEntry() {
    if (!this._pageEntry || (this._startup && !this._startup.revealing)) return;
    const entry = this._pageEntry;
    if (
      entry.kind === "project" &&
      !entry.immediate &&
      !this.projectScene.galleryReleased
    )
      return;
    if (
      entry.kind === "project" &&
      !entry.direct &&
      !entry.immediate &&
      this.persistentScene._projectQuad < timings.pages.projectDomAt
    )
      return;
    const revealDuringWipe =
      (entry.kind === "about" ||
        entry.direct ||
        this.persistentScene._projectMotionReady) &&
      this.transitionManager.phase === "transition" &&
      this.transitionManager.transitionProgress >=
        this.persistentScene.pageTiming.aboutRevealAt;
    if (this.transitionManager.phase !== "pinned" && !revealDuringWipe) return;
    this._pageEntry = null;
    if (entry.kind === "about")
      this.aboutScene.startReveal({ immediate: entry.immediate });
    dispatcher.trigger(
      { name: entry.kind === "about" ? "aboutOpened" : "projectOpened" },
      entry.kind === "project" ? { slug: entry.slug } : {},
    );
  }

  async _switchPinnedPage(route) {
    const project = route.kind === "project" ? findProject(route.slug) : null;
    const immediate = Boolean(route.immediate);
    this._pageEntry = null;
    if (!project) this.aboutScene.prepareReveal();
    if (project && this._pinnedKind === "project") {
      this.projectScene.continuePageScroll();
      this.projectScene.switchReveal({ immediate });
    } else if (project) {
      this.projectScene.resetPageScroll();
      this.projectScene.startReveal({ immediate });
    } else if (this._pinnedKind === "project")
      this.projectScene.hideReveal({ immediate });
    if (route.kind !== this._pinnedKind)
      (project ? this.projectScene : this.aboutScene).setPageScroll(0);
    this.transitionManager.switchPinned(
      project ? this.projectSceneId : this.aboutSceneId,
      project ? this.projectScene : this.aboutScene,
      { immediate },
    );
    await this.persistentScene.changePinnedContent(project, { immediate });
    this._pinnedKind = route.kind;
    this._projectSlug = project?.slug ?? null;
    (project ? this.projectScene : this.aboutScene).setPageScroll(0);
    this._pageEntry = {
      kind: route.kind,
      slug: project?.slug,
      immediate,
      direct: true,
    };
    this._completePageEntry();
  }

  // Route (deep link / popstate) asks for a project
  _disablePageControls() {
    this._pageControls = [
      store.camera.controls,
      this.sceneManager.cameraController.controls,
    ]
      .filter(Boolean)
      .map((controls) => ({ controls, enabled: controls.enabled }));
    for (const { controls } of this._pageControls) controls.enabled = false;
  }

  _restorePageControls() {
    for (const { controls, enabled } of this._pageControls ?? [])
      controls.enabled = enabled;
    this._pageControls = null;
  }

  onOpenProject(data) {
    const slug = data?.slug;
    if (!slug) return;

    if (!this.transitionManager) {
      this._pendingProjectSlug = slug;
      return;
    }

    this._openProject(findProject(slug));
  }

  // Route left /project/<slug> (browser back)
  onCloseProject() {
    this._pendingProjectSlug = null;
    if (!this.transitionManager || this._pinnedKind !== "project") return;

    this.onNavigatePage({ kind: "home" });
  }

  // Route (deep link / popstate) asks for the about page
  onOpenAbout() {
    if (!this.transitionManager) {
      this._pendingAbout = true;
      return;
    }
    this._openAbout();
  }

  // Route left /about (browser back)
  onCloseAbout() {
    this._pendingAbout = false;
    if (!this.transitionManager || this._pinnedKind !== "about") return;

    this.onNavigatePage({ kind: "home" });
  }

  // Triggered from the browser console via window.gotoScene() / window.nextScene()
  onGotoScene({ target } = {}) {
    if (!this.transitionManager) return;

    if (target === undefined || target === null) {
      this.transitionManager.next();
      return;
    }

    const asNumber = Number(target);
    if (Number.isInteger(asNumber) && String(target).trim() !== "") {
      this.transitionManager.transitionTo(asNumber);
      return;
    }

    const key = String(target)
      .toLowerCase()
      .replace(/scene$/, "");
    const idx = this.sceneInstances.findIndex(
      (inst) => inst.name.toLowerCase().replace(/scene$/, "") === key,
    );

    if (idx === -1) {
      console.warn(
        `Unknown scene "${target}". Loaded scenes: ${this.sceneInstances
          .map((inst) => inst.name)
          .join(", ")}`,
      );
      return;
    }

    this.transitionManager.transitionTo(idx);
  }

  async onLoadEnd() {
    const { gl } = store;
    const debug = getFlag("debug");
    await this._shadersReady;

    // Real viewport from the store (kept current by onResize). The old
    // window fallback returned 1920x1080 in the worker, leaving the camera
    // aspect stale until a later resize event — squashing everything.
    const { width, height, devicePixelRatio } = store.viewport;

    // Create persistent scene (handles grid, background plane)
    this.persistentScene = new PersistentScene(
      gl,
      width,
      height,
      devicePixelRatio,
    );

    // Create scene manager and immediately sync it to the real viewport
    // (its constructor has the same 1920x1080 worker fallback)
    this.sceneManager = new SceneManager(gl, null, debug);
    if (this._startup)
      this.sceneManager.post.material.startupTransition =
        new WorldPositionTransition();
    this.sceneManager.resize({ width, height, devicePixelRatio });

    // Initialize orbit controls for CameraController (for debug mode)
    if (debug && gl.domElement) {
      this.sceneManager.cameraController.initOrbitControls(gl.domElement);
    }

    // Set persistent scene
    this.sceneManager.setPersistentScene(this.persistentScene);

    // Create and register scenes
    const sceneConfig = { screenLight: this.persistentScene.screenLight };
    this.sceneInstances = this._sceneClasses.map(
      (SceneClass) => new SceneClass(sceneConfig),
    );

    this.sceneIds = this.sceneInstances.map((inst) =>
      this.sceneManager.addScene(inst),
    );
    this._sceneNames = this.sceneInstances.map((inst) =>
      inst.name.replace(/Scene$/, ""),
    );
    this._touchDebug = getFlag("debugTouch");
    this._timeline = { state: null, index: -1, t0: -1 };

    // Project and about scenes live outside the cycling sequence; the
    // transition manager pins them when opened (click or deep link)
    this.projectScene = new ProjectScene(sceneConfig);
    this.projectSceneId = this.sceneManager.addScene(this.projectScene);
    this.aboutScene = new AboutScene(sceneConfig);
    this.aboutSceneId = this.sceneManager.addScene(this.aboutScene);
    this._pinnedKind = null;

    // About and labels have asynchronous builders outside the asset loader.
    // Keep navigation queued until their complete render paths are prepared.
    try {
      await Promise.all([
        ...this.sceneInstances.map((scene) => scene.ready),
        this.aboutScene.ready,
        this.persistentScene.grid.projectsOverlay?.ready,
        this.persistentScene.grid.projectHint?.ready,
      ]);
      await prepareScenes(
        this.sceneManager,
        this.sceneIds,
        [this.projectSceneId, this.aboutSceneId],
        (progress) =>
          dispatcher.trigger({ name: "compileProgress" }, { progress }),
      );
      await this.persistentScene.prepareProject(PROJECTS[0]);
    } catch (error) {
      console.error(
        "Scene preparation failed; continuing with live rendering",
        error,
      );
    }

    // Create transition manager (?manual disables auto-cycling)
    this.transitionManager = new TransitionManager(this.sceneManager, {
      idleMs: timings.world.idle * 1000,
      transitionMs: timings.world.duration * 1000,
      // A scene URL is a pinned preview. In debug its neighbours are loaded
      // for explicit pause/scrub testing, but it never advances by itself.
      autoAdvance: !getFlag("manual") && getParam("scene") === null,
    });
    this.transitionManager.setSequence(this.sceneIds, this.sceneInstances);
    // Loading may take longer than the idle interval. Start the visible clock now.
    this.transitionManager.start(performance.now() - raf.startTime);
    this.transitionManager.lastNow = this.transitionManager.t0;

    // Deep link (/project/<slug> or /about) arrived before scenes were ready
    if (
      this._startup &&
      (this._requestedPage?.kind === "about" ||
        (this._requestedPage?.kind === "project" &&
          findProject(this._requestedPage.slug)))
    ) {
      const route = this._requestedPage;
      this._requestedPage = null;
      this._startup.page = true;
      selectTransitionTiming("loader", route.kind);
      // Select the destination under the opaque loader. Its content stays
      // unrevealed until the entry gesture, without a visible home transition.
      if (route.kind === "about") this._openAbout({ immediate: true });
      else this._openProject(findProject(route.slug), { immediate: true });
      await this.persistentScene.gallery?.ready;
    } else if (this._requestedPage) {
      this._flushPageNavigation();
    } else if (this._pendingProjectSlug) {
      this._openProject(findProject(this._pendingProjectSlug), {
        immediate: true,
      });
      this._pendingProjectSlug = null;
    } else if (this._pendingAbout) {
      this._openAbout({ immediate: true });
      this._pendingAbout = false;
    }

    // Apply scene-entry state before the first visible render as well as on
    // later transitions, so an incoming scene never flashes its old values.
    this._syncSceneEntry();
    this._attachSceneDebug();

    if (this._startup) {
      this.sceneManager.post.material.startupProgress.value = 0;
      this.sceneManager.post.material.startupTransition?.setOriginBelowGrid(
        this.persistentScene.grid,
      );
      if (!this._startup.page) {
        this.persistentScene.startHomeReturn();
        this.persistentScene.prepareHomeReturn();
      } else {
        this.persistentScene._screenHeldForPage = true;
      }
      this.persistentScene.grid.setHideProgress(1);
      this.persistentScene._tilesOut.progress = 1;
      this.persistentScene._pinOverlayOut({ immediate: true });
      for (const scene of this.sceneInstances)
        scene.setInteractionEnabled?.(false);
    }

    this._ready = true;
    this.sceneManager.render(this.transitionManager.lastNow, 0);
    dispatcher.trigger({ name: "compileEnd", fireAtStart: true });
    const images = new Set(
      PROJECTS.flatMap((project) => project.media)
        .filter((media) => media.type === "image")
        .map((media) => resolvePublicPath(media.src)),
    );
    for (const url of images) fetch(url, { priority: "low" }).catch(() => {});
  }
}

export default Site;
