class Loop {
  constructor() {
    if (Loop._instance) {
      return Loop._instance;
    }

    Loop._instance = this;

    this.rafId = null;
    this.callbacks = new Set();
  }

  addCallback(callback) {
    this.callbacks.add(callback);

    if (!this.rafId) {
      this.startLoop();
    }
  }

  removeCallback(callback) {
    this.callbacks.delete(callback);

    if (this.callbacks.size === 0) {
      console.log("remove callback");
      this.stopLoop();
    }
  }

  startLoop() {
    const loop = (time) => {
      this.callbacks.forEach((callback) => callback(time));
      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stopLoop() {
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}

const loop = /* @__PURE__ */ new Loop();
export default loop;

// Usage in another module
// import loop from '@/main/utils/loop';

// loop.addCallback(() => console.log("Animating..."));
// later
// loop.removeCallback(() => console.log("Animating..."));
