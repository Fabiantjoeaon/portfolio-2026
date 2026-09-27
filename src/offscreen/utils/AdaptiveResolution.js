import dispatcher from "@/shared/dispatcher";
import { MAX_FPS } from "@/shared/frameLimit";

export const ENABLE_ADAPTIVE_RESOLUTION = true;

const STEP = 0.25;
const WINDOW = 90;
const SLOW = 1.1;
const FAST = 1.03;
const GOOD_WINDOWS = 4;
const MAX_BACKOFF = 32;
const REFRESH_INTERVALS = [240, 165, 144, 120, 100, 90, 75, 60, 50, 48, 30].map((hz) => 1000 / hz);

function snapRefresh(interval) {
  let best = REFRESH_INTERVALS[0];
  for (const candidate of REFRESH_INTERVALS)
    if (Math.abs(Math.log(interval / candidate)) < Math.abs(Math.log(interval / best))) best = candidate;
  return best;
}

/**
 * Lowers the render pixel ratio while frames miss the display refresh and
 * raises it again once they keep up. GPU time is invisible to the worker, so
 * the rAF interval is the signal: a GPU-bound frame arrives late.
 */
export class AdaptiveResolution {
  constructor() {
    this.base = null;
    this.dpr = 0;
    this.refresh = Infinity;
    this.samples = new Float32Array(WINDOW);
    this.count = 0;
    this.sum = 0;
    this.lastTime = 0;
    this.goodWindows = 0;
    this.backoff = 1;
    this.windowsSinceRaise = Infinity;
  }

  setBase(size) {
    this.base = size;
    this.dpr = size.dpr;
    this._reset();
  }

  update(now) {
    const interval = now - this.lastTime;
    this.lastTime = now;
    if (!this.base || interval <= 0 || interval > 250) return;
    this.samples[this.count++] = interval;
    this.sum += interval;
    if (this.count < WINDOW) return;

    const mean = this.sum / WINDOW;
    this.samples.sort();
    this.refresh = Math.max(1000 / MAX_FPS,
      Math.min(this.refresh, snapRefresh(this.samples[WINDOW >> 1])));
    this.count = 0;
    this.sum = 0;
    this.windowsSinceRaise++;
    const min = Math.min(1, this.base.dpr);

    if (mean > this.refresh * SLOW) {
      this.goodWindows = 0;
      if (this.windowsSinceRaise <= 2) this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF);
      if (this.dpr > min) this._apply(Math.max(min, this.dpr - STEP));
    } else if (mean < this.refresh * FAST && this.dpr < this.base.dpr) {
      if (++this.goodWindows < GOOD_WINDOWS * this.backoff) return;
      this.goodWindows = 0;
      this.windowsSinceRaise = 0;
      this._apply(Math.min(this.base.dpr, this.dpr + STEP));
    }
  }

  _apply(dpr) {
    console.info(`[adaptive] ${this.dpr} -> ${dpr}`);
    this.dpr = dpr;
    this._reset();
    dispatcher.trigger({ name: "resize" }, { ...this.base, dpr, adaptive: true });
  }

  _reset() {
    this.count = 0;
    this.sum = 0;
    this.lastTime = 0;
  }
}
