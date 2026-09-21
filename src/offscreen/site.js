import * as THREE from "three/webgpu";

import { scene, camera } from "@/offscreen/main";
import { store, useViewportStore } from "@/offscreen/store";
import virtualElement from "@/offscreen/dispatcher/helpers/virtualElement";
import { component, updateComponentRegistry } from "@/offscreen/dispatcher";
import { raf } from "@/offscreen/dispatcher/helpers/raf";
import debugInfos from "@/offscreen/utils/debugInfos";
import { compileScene } from "@/offscreen/utils/compileScene";
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

// Mouse tracker for hover controls
import { mouseTracker } from "@/offscreen/input/MouseTracker";
import { clearBoundParams } from "@/offscreen/debug/bindDebugParams";
import { attachSaveParamsButton } from "@/offscreen/debug/saveParams";

// Scene sequence. Pick a single one with ?scene=<name> (or ?scene=<index>)
const SCENE_REGISTRY = {
  // meadow: MeadowScene,
  // demo: DemoScene,
  // vat: VATScene,
  ice: IceScene,
  cube: CubeScene,
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
    loader.load();
  }

  onInitDebug({ gui }) {
    console.log("🏗️ Debug mode is enabled");
    store.debugGui = gui;
    clearBoundParams();
    attachSaveParamsButton(gui);

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
    // Skip updates if device is lost
    if (this.gl && this.gl.isDeviceValid === false) return;

    // Update mouse tracker from store pointer (for offscreen worker)
    mouseTracker.updateFromStore();

    // Update transition manager with time in milliseconds
    if (this.transitionManager) {
      this.transitionManager.update(elapsedTime * 1000, delta);
    }

    // Render via scene manager (handles multi-pass GBuffer rendering)
    if (this.sceneManager) {
      this.sceneManager.render(elapsedTime * 1000, delta);
    }
  }

  onProjectVideoFrame(data) {
    this.persistentScene?.setProjectVideoFrame(data);
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

    this.persistentScene?.attachDebug?.(gui);
    this.projectScene?.attachDebug?.(gui);
    this.aboutScene?.attachDebug?.(gui);

    for (const inst of this.sceneInstances ?? []) {
      inst.attachDebug?.(gui, { sceneManager: this.sceneManager });
    }
  }

  /**
   * Canvas click: open the project of the active tile under the pointer.
   * Same world-position transition as scene cycling; the TransitionManager
   * pins the project scene while the persistent grid scales its tiles out.
   */
  onClick() {
    const project = this.persistentScene?.hoveredProject;
    if (!project) return;
    this._openProject(project);
  }

  _openProject(project, { immediate = false } = {}) {
    if (!project || !this.transitionManager) return;

    const started = this.transitionManager.enterPinned(
      this.projectSceneId,
      this.projectScene,
      { immediate },
    );
    if (!started) return;
    this._pinnedKind = "project";

    this.persistentScene.enterProject(project, { immediate });

    // Main thread updates the route to /project/<slug>
    dispatcher.trigger({ name: "projectOpened" }, { slug: project.slug });
  }

  _openAbout({ immediate = false } = {}) {
    if (!this.transitionManager) return;

    const started = this.transitionManager.enterPinned(
      this.aboutSceneId,
      this.aboutScene,
      { immediate },
    );
    if (!started) return;
    this._pinnedKind = "about";

    this.persistentScene.enterAbout({ immediate });
    this.aboutScene.startReveal({ immediate });

    // Main thread updates the route to /about
    dispatcher.trigger({ name: "aboutOpened" }, {});
  }

  // Route (deep link / popstate) asks for a project
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

    if (this.transitionManager.exitPinned()) {
      this.persistentScene.exitProject();
      this._pinnedKind = null;
    }
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

    if (this.transitionManager.exitPinned()) {
      this.persistentScene.exitAbout();
      this._pinnedKind = null;
    }
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

  onLoadEnd() {
    const { camera: storeCamera, gl } = store;
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
    const sceneParam = getParam("scene");
    const sceneKeys = Object.keys(SCENE_REGISTRY);
    const sceneConfig = { screenLight: this.persistentScene.screenLight };

    if (sceneParam !== null) {
      const key = sceneParam.toLowerCase().replace(/scene$/, "");
      const SceneClass =
        SCENE_REGISTRY[key] ?? SCENE_REGISTRY[sceneKeys[Number(sceneParam)]];

      if (SceneClass) {
        this.sceneInstances = [new SceneClass(sceneConfig)];
      } else {
        console.warn(
          `Unknown scene "${sceneParam}". Available: ${sceneKeys.join(", ")}`,
        );
        this.sceneInstances = [new MeadowScene(sceneConfig)];
      }
    } else {
      this.sceneInstances = sceneKeys.map(
        (key) => new SCENE_REGISTRY[key](sceneConfig),
      );
    }

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

    // Create transition manager (?manual disables auto-cycling)
    this.transitionManager = new TransitionManager(this.sceneManager, {
      idleMs: 6000,
      transitionMs: 2000,
      autoAdvance: !getFlag("manual"),
    });
    this.transitionManager.setSequence(this.sceneIds, this.sceneInstances);
    // Start with 0 since update() receives cumulative elapsedTime * 1000
    this.transitionManager.start(0);

    // Deep link (/project/<slug> or /about) arrived before scenes were ready
    if (this._pendingProjectSlug) {
      this._openProject(findProject(this._pendingProjectSlug), {
        immediate: true,
      });
      this._pendingProjectSlug = null;
    } else if (this._pendingAbout) {
      this._openAbout({ immediate: true });
      this._pendingAbout = false;
    }

    this._attachSceneDebug();

    // Add basic lighting to main scene (for demo purposes)
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.castShadow = false;
    dirLight.position.set(5, 100, 10);
    scene.add(dirLight);

    // Wait for compilation to finish to start rendering
    compileScene(this.gl, scene).then(() => {
      dispatcher.trigger({ name: "compileEnd", fireAtStart: true });
    });
  }
}

export default Site;

// Minimal HMR setup
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    updateComponentRegistry("Site", newModule);
  });
}
