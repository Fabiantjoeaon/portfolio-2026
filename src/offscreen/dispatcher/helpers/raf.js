import dispatcher from "@/shared/dispatcher";
import { store } from "@/offscreen/store";
import gsap from "gsap";
import { FrameLimit, MAX_FPS } from "@/shared/frameLimit";
import { getFlag } from "@/offscreen/lib/query";
import { signalFpsFrame } from "@/shared/fps";
import { runFrameJob } from "@/offscreen/utils/frameJobs";

class Raf {
  constructor() {
    this.time = self.performance.now();

    /**
     * A reference to the context from `requestAnimationFrame()` can
     * be called (usually `window`).
     *
     * @type {?(Window|XRSession)}
     */
    this._context = typeof self !== "undefined" ? self : null;
  }

  start(gl) {
    this.startTime = self.performance.now();
    this.oldTime = this.startTime;
    this.isPaused = false;
    // Worker rAF is not throttled with the page everywhere.
    let hidden = false;
    dispatcher.on("visibility", (data) => { hidden = data.hidden; });
    const frameLimit = new FrameLimit();
    const trackFps = getFlag("fps");
    const trackHitches = getFlag("hitches");
    let lastFrameAt = 0;
    gsap.ticker.fps(MAX_FPS);

    gl.setAnimationLoop(async (now, xrFrame) => {
      if (this._isFrameProcessing || this._isRecordingProcessing || !frameLimit.accept(now)) return;
      const { recording } = store;

      // Recording branch: drive deterministic time and capture frames without spawning a second RAF
      if (recording) {
        if (this._isRecordingProcessing) return;
        this._isRecordingProcessing = true;

        try {
          const frameRate = store.recordFrameRate || 60;
          // Deterministic timebase for GSAP and the scene
          this._recordTime = (this._recordTime ?? 0) + 1 / frameRate;

          try {
            gsap.updateRoot(this._recordTime);
          } catch (e) {
            // noop
            console.warn(e);
          }

          // Render the frame with deterministic delta
          await dispatcher.triggerOnRaf({
            now: this._recordTime * 1000,
            delta: 1 / frameRate,
            xrFrame,
          });
          runFrameJob();

          if (store.recorder && typeof store.recorder.step === "function") {
            await store.recorder.step();
          }

          store.recordFrameCount = (store.recordFrameCount || 0) + 1;

          if (
            store.recordTotalFrames &&
            store.recordFrameCount >= store.recordTotalFrames
          ) {
            let buffer;
            if (store.recorder && typeof store.recorder.stop === "function") {
              buffer = await store.recorder.stop();
            }

            store.recording = false;
            this._recordTime = 0;
            // Notify main thread/UI with the recorded buffer for download handling
            dispatcher.trigger({ name: "recordingStopped" }, { buffer });
          }
        } finally {
          this._isRecordingProcessing = false;
        }

        // Do not run the non-recording branch when recording
        return;
      }

      if (!this.isPaused && !hidden) {
        if (trackFps) signalFpsFrame();
        const elapsedTime = (now - this.startTime) / 1000; // Convert to seconds
        this._isFrameProcessing = true;
        const workStart = trackHitches ? self.performance.now() : 0;
        try {
          await dispatcher.triggerOnRaf({
            now,
            xrFrame,
            elapsedTime,
            startTime: this.startTime,
          });
          runFrameJob();
        } finally {
          this._isFrameProcessing = false;
        }
        if (trackHitches) {
          // 30 ms: one missed frame at 60 Hz, above the frame limiter's own spacing.
          const work = self.performance.now() - workStart;
          const gap = lastFrameAt ? workStart - lastFrameAt : 0;
          if (gap > 30 || work > 30)
            dispatcher.trigger({ name: "hitch" }, { gap: Math.round(gap), work: Math.round(work) });
          lastFrameAt = workStart;
        }
      }
    });
  }

  pause() {
    this.isPaused = true;
  }
}

export const raf = new Raf();
