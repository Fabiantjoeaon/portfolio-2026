import { store } from "../store.js";

export const mouse = {
  clientX: 0,
  clientY: 0,
  x: 0, // normalized -1 to 1
  y: 0, // normalized -1 to 1
  isDown: false,
};

class MouseTracker {
  constructor() {
    this.width = typeof window !== "undefined" ? window.innerWidth : 1920;
    this.height = typeof window !== "undefined" ? window.innerHeight : 1080;

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onResize = this.onResize.bind(this);

    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    // In offscreen worker context, we get pointer events from the main thread
    // For now, we'll also sync with the store's pointer
    if (typeof window !== "undefined") {
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("pointerdown", this.onPointerDown);
      window.addEventListener("pointerup", this.onPointerUp);
      window.addEventListener("resize", this.onResize);
    }

    // Initialize with center
    mouse.clientX = this.width / 2;
    mouse.clientY = this.height / 2;
    mouse.x = 0;
    mouse.y = 0;

    this.initialized = true;
  }

  /**
   * Update from store pointer (used in offscreen worker)
   */
  updateFromStore() {
    if (store.pointer) {
      mouse.x = store.pointer.x;
      mouse.y = store.pointer.y;
    }
  }

  updateMouse(x, y) {
    mouse.clientX = x;
    mouse.clientY = y;

    // Normalize to -1 to 1
    mouse.x = (x / this.width) * 2 - 1;
    mouse.y = 1 - (y / this.height) * 2; // Flip Y so up is positive
  }

  onPointerMove(e) {
    this.updateMouse(e.clientX, e.clientY);
  }

  onPointerDown(e) {
    mouse.isDown = true;
    this.updateMouse(e.clientX, e.clientY);
  }

  onPointerUp(e) {
    mouse.isDown = false;
    this.updateMouse(e.clientX, e.clientY);
  }

  onResize() {
    if (typeof window !== "undefined") {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
    }
  }

  dispose() {
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("pointerdown", this.onPointerDown);
      window.removeEventListener("pointerup", this.onPointerUp);
      window.removeEventListener("resize", this.onResize);
    }
  }
}

// Singleton instance
export const mouseTracker = new MouseTracker();

