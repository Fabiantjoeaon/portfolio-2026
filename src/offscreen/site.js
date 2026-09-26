import "@/offscreen/main";
import { store, useViewportStore } from "@/offscreen/store";
import virtualElement from "@/offscreen/dispatcher/helpers/virtualElement";
import { component, updateComponentRegistry } from "@/offscreen/dispatcher";
import { raf } from "@/offscreen/dispatcher/helpers/raf";
import debugInfos from "@/offscreen/utils/debugInfos";
import { prepareScenes } from "@/offscreen/utils/prepareScenes";
import loader from "@/offscreen/loader";
import dispatcher from "@/shared/dispatcher";

// init events
import "@/offscreen/dispatcher";

// Managers
import { SceneManager, TransitionManager } from "@/offscreen/managers";

// Scenes
import PersistentScene from "@/offscreen/scenes/PersistentScene";
import MeadowScene from "@/offscreen/scenes/MeadowScene";
import DemoScene from "@/offscreen/scenes/DemoScene";
import VATScene from "@/offscreen/scenes/VATScene";
import IceScene from "@/offscreen/scenes/IceScene";
import CubeScene from "@/offscreen/scenes/CubeScene";
import ProjectScene from "@/offscreen/scenes/ProjectScene";
import AboutScene from "@/offscreen/scenes/AboutScene";
import { getFlag, getParam } from "@/offscreen/lib/query";
import { findProject } from "@/shared/projects";
import { timings } from '@/shared/timings';

// Mouse tracker for hover controls
import { mouseTracker } from "@/offscreen/input/MouseTracker";
import { clearBoundParams } from "@/offscreen/debug/bindDebugParams";
import { attachSaveParamsButton } from "@/offscreen/debug/saveParams";
import { attachTimingsDebug } from '@/offscreen/debug/bindTimingsDebug';
import { bindTransitionDebug } from "@/offscreen/transitions";
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
  init({ gl }) {
    this.gl = gl;
    this.progressDamp = 0;

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

  onInitDebug({ gui }) {
    console.log("🏗️ Debug mode is enabled");
    store.debugGui = gui;
    clearBoundParams();
    attachSaveParamsButton(gui);
    const timingsGui = this.gl.inspector?.createParameters('Animation timings') ?? gui.addFolder('Animation timings');
    attachTimingsDebug(timingsGui);

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

    // Update mouse tracker from store pointer (for offscreen worker)
    mouseTracker.updateFromStore();

    // Update transition manager with time in milliseconds
    if (this.transitionManager) {
      this.transitionManager.update(elapsedTime * 1000, delta);
      this._updateHomeReturn(delta);
      this._syncSceneEntry();
      if (this._pinnedKind === 'project' && (this.transitionManager.phase === 'pinned' ||
          (this.transitionManager.transitionProgress >= this.persistentScene.pageTiming.projectScreenAt && this.persistentScene._tilesOut.progress === 1)))
        this.persistentScene._projectMotionReady = true;
      this._flushPageNavigation();
      this._completePageEntry();
      this._syncSceneInteractions();
    }

    // Render via scene manager (handles multi-pass GBuffer rendering)
    if (this.sceneManager) {
      this.sceneManager.render(elapsedTime * 1000, delta);
      this._syncAudioScene();
    }
  }

  _activeSceneObj() {
    const manager = this.sceneManager;
    const id = manager.isTransitioning && manager.activeNextId !== null
      ? manager.activeNextId
      : manager.activePrevId;
    return manager.scenes.get(id)?.sceneObj ?? null;
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
    const interactiveId = this.transitionManager?.interactionSceneId;
    const active = interactiveId == null
      ? null
      : this.sceneManager.scenes.get(interactiveId)?.sceneObj ?? null;
    const enabled = !this._pinnedKind && !this._homeReturn &&
      Boolean(this.transitionManager?.canInteract) && !this._gridOwnsPointer();
    for (const scene of this.sceneInstances ?? [])
      scene.setInteractionEnabled?.(enabled && scene === active);
  }

  /** Pinned pages map to `project` / `about`; during a cycle the incoming scene wins. */
  _syncAudioScene() {
    const name = this._pinnedKind ??
      this._activeSceneObj()?.name?.toLowerCase().replace(/scene$/, "");
    if (!name || name === this._audioScene) return;
    this._audioScene = name;
    audio.setScene(name);
  }

  onProjectVideoFrame(data) {
    this.persistentScene?.setProjectVideoFrame(data);
  }

  onPageScroll({ scroll = 0, viewportHeight = 1 }) {
    const scene =
      this._pinnedKind === "project" ? this.projectScene : this.aboutScene;
    scene?.setPageScroll(scroll, viewportHeight);
    if (this._pinnedKind === 'project') this.persistentScene._projectScroll = scroll;
  }

  onProjectGallery({ slug, step, index, activate, immediate, phase, distance, velocity }) {
    const gallery = this.persistentScene?.gallery;
    if (this._pinnedKind !== 'project' || gallery?.project.slug !== slug) return;
    if (activate) gallery.activate(immediate);
    else gallery.change({ step, index, immediate, phase, distance, velocity });
  }

  onNavigatePage(route) {
    // Last request wins, including requests arriving during a GPU transition.
    this._requestedPage = route;
    this._flushPageNavigation();
  }

  onPageContentExited({ revision }) {
    this._contentExitedRevision = Math.max(this._contentExitedRevision ?? 0, revision);
  }

  _beginHomeReturn(route) {
    this._pageEntry = null;
    const state = this._homeReturn = { ...route, stage: 'content', gpuReady: false };
    this.persistentScene.prepareHomeReturn();
    const exit = this._pinnedKind === 'about'
      ? this.aboutScene.hidePage(route.immediate)
      : this.persistentScene.gallery?.hidePage(route.immediate);
    Promise.resolve(exit).then(() => { state.gpuReady = true; });
  }

  _updateHomeReturn(delta) {
    const state = this._homeReturn;
    if (!state) return;
    if (state.stage === 'content') {
      if (!state.gpuReady || (state.waitForContent && (this._contentExitedRevision ?? 0) < state.revision)) return;
      if (!this.transitionManager.exitPinned({ immediate: state.immediate })) return;
      this.persistentScene.startHomeReturn(state.immediate);
      this._pinnedKind = this._projectSlug = null;
      state.stage = 'reveal';
    }
    const ready = this.persistentScene.updateHomeReturn(delta);
    if (!ready || this.transitionManager.phase === 'transition') return;
    this.persistentScene.finishHomeReturn();
    this.transitionManager.finishHomeReturn();
    this._restorePageControls();
    this._homeReturn = null;
    dispatcher.trigger({ name: 'pageClosed' }, {});
  }

  _flushPageNavigation() {
    const route = this._requestedPage;
    if (!route || !this.transitionManager || this._pageSwitch || this._homeReturn) return;
    if (this.transitionManager.phase === "transition") {
      return;
    }
    if (this.transitionManager.phase === 'idle' && !this.transitionManager.canInteract) return;
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
    if (this._pinnedKind) {
      if (route.kind === 'about' || (route.kind === 'project' && findProject(route.slug))) {
        this._requestedPage = null;
        this._pageSwitch = this._switchPinnedPage(route).finally(() => { this._pageSwitch = null; });
        return;
      }
      this._requestedPage = null;
      this._beginHomeReturn(route);
      return;
    }
    this.aboutScene.setPageScroll(0);
    this.projectScene.setPageScroll(0);
    this._requestedPage = null;
    if (route.kind === "about") this._openAbout({ immediate: !this._ready || route.immediate });
    else if (route.kind === "project")
      this._openProject(findProject(route.slug), { immediate: !this._ready || route.immediate });
    else dispatcher.trigger({ name: "pageClosed" }, {});
  }

  onDeviceLost({ reason, message }) {
    console.warn(
      `WebGPU device lost in Site: ${message || reason || "unknown"}`,
    );
  }

  onDeviceRestored() {
    console.log("WebGPU device restored - resuming rendering");
  }

  onResize({ width, height, dpr }) {
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
    const project = gridOwnsPointer ? this.persistentScene?.hoveredProject : null;
    if (project) {
      this.onNavigatePage({ kind: "project", slug: project.slug });
      return;
    }
    if (gridOwnsPointer) return;
    if (!this._pinnedKind && this.sceneManager && this.transitionManager?.canInteract)
      this.sceneManager.scenes
        .get(this.transitionManager.interactionSceneId)?.sceneObj
        ?.onPointerClick?.();
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
    if (!this._pageEntry) return;
    const entry = this._pageEntry;
    if (entry.kind === 'project' && !entry.direct && !entry.immediate && this.persistentScene._projectQuad < timings.pages.projectDomAt) return;
    const revealDuringWipe =
      (entry.kind === "about" || entry.direct || this.persistentScene._projectMotionReady) &&
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
    const project = route.kind === 'project' ? findProject(route.slug) : null;
    const immediate = Boolean(route.immediate);
    this._pageEntry = null;
    if (!project) this.aboutScene.prepareReveal();
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
    this._pageEntry = { kind: route.kind, slug: project?.slug, immediate, direct: true };
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

    this.onNavigatePage({ kind: 'home' });
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

    this.onNavigatePage({ kind: 'home' });
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
      await prepareScenes(this.sceneManager, this.sceneIds, [
        this.projectSceneId,
        this.aboutSceneId,
      ]);
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
    if (this._requestedPage) {
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

    this._ready = true;
    this.sceneManager.render(this.transitionManager.lastNow, 0);
    dispatcher.trigger({ name: "compileEnd", fireAtStart: true });
  }
}

export default Site;

// Minimal HMR setup
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    updateComponentRegistry("Site", newModule);
  });
}
