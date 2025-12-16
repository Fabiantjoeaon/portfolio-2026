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
import PersistentScene from "@/offscreen/meshes/PersistentScene";
import MeadowScene from "@/offscreen/meshes/MeadowScene";
import { getFlag } from "@/offscreen/lib/query";

// Mouse tracker for hover controls
import { mouseTracker } from "@/offscreen/input/MouseTracker";

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

    const isOffscreen = typeof window === "undefined";

    if (!isOffscreen) {
      dispatcher.trigger(
        { name: "debug", fireAtStart: true },
        {
          gui,
        }
      );
    }
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

  onDeviceLost({ reason, message }) {
    console.warn(
      `WebGPU device lost in Site: ${message || reason || "unknown"}`
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

  onLoadEnd() {
    const { camera: storeCamera, gl } = store;
    const debug = getFlag("debug");

    // Get viewport dimensions
    const width = typeof window !== "undefined" ? window.innerWidth : 1920;
    const height = typeof window !== "undefined" ? window.innerHeight : 1080;
    const devicePixelRatio =
      typeof window !== "undefined"
        ? Math.min(window.devicePixelRatio || 1, 2)
        : 1;

    // Create persistent scene (handles grid, background plane)
    this.persistentScene = new PersistentScene(
      gl,
      width,
      height,
      devicePixelRatio
    );

    // Create scene manager with external camera
    this.sceneManager = new SceneManager(
      gl,
      storeCamera.camera || storeCamera,
      debug
    );

    // Set persistent scene
    this.sceneManager.setPersistentScene(this.persistentScene);

    // Create and register scenes
    this.sceneInstances = [
      new MeadowScene(),
      // Add more scenes here
    ];

    this.sceneIds = this.sceneInstances.map((inst) =>
      this.sceneManager.addScene(inst)
    );

    // Create transition manager
    this.transitionManager = new TransitionManager(this.sceneManager, {
      idleMs: 6000,
      transitionMs: 2000,
    });
    this.transitionManager.setSequence(this.sceneIds, this.sceneInstances);
    this.transitionManager.start(performance.now());

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
