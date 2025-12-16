import * as THREE from "three/webgpu";

// storeWorker.js
export const defaultFPS = 60;

const store = {
  compiled: false,
  dpr: 1,
  fbo: new THREE.RenderTarget(1, 1, {}),
  fboScene: new THREE.Scene(),
  // Initial state of your store
  scene: null,
  scroll: 0,
  gl: null,
  orthographicLayer: 1,
  perspectiveLayer: 2,
  isWebGPU: true,
  // pointers
  pointer: new THREE.Vector2(),
  pointerLerp: new THREE.Vector2(),
  pointerLerpPrev: new THREE.Vector2(),
  pointerLerpDelta: new THREE.Vector2(),
  mouseVelocityRef: new THREE.Vector3(),
  mouseDirectionRef: new THREE.Vector3(),
  // recording state
  recorder: null,
  recording: false,
  recordFrameRate: 60,
  recordTotalFrames: 0,
  recordFrameCount: 0,
  // viewport
  viewport: {
    width: typeof window !== "undefined" ? window.innerWidth : 1920,
    height: typeof window !== "undefined" ? window.innerHeight : 1080,
    devicePixelRatio:
      typeof window !== "undefined"
        ? Math.min(window.devicePixelRatio || 1, 2)
        : 1,
  },
};

// Simple viewport store with subscribe pattern (zustand-like)
const viewportListeners = new Set();

export const useViewportStore = {
  getState: () => ({ viewport: store.viewport }),
  subscribe: (listener) => {
    viewportListeners.add(listener);
    return () => viewportListeners.delete(listener);
  },
  setViewport: (viewport) => {
    store.viewport = { ...store.viewport, ...viewport };
    viewportListeners.forEach((listener) =>
      listener({ viewport: store.viewport })
    );
  },
};

// Your worker logic here that uses updateStore and store as needed

export { store };
