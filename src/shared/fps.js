const FPS_MESSAGE = "__fps";

let onFrame = null;

export function bindFpsTick(fn) {
  onFrame = fn;
}

export function signalFpsFrame() {
  if (onFrame) {
    onFrame();
    return;
  }

  self.postMessage(FPS_MESSAGE);
}

export { FPS_MESSAGE };
