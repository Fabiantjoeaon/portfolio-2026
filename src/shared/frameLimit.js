export const MAX_FPS = 60;
// GSAP's own default: a tick on every display refresh up to 240Hz.
export const UNCAPPED_FPS = 240;

/** Keep a stable cadence on high-refresh displays without catch-up renders. */
export class FrameLimit {
  constructor() {
    this.next = null;
  }

  accept(now) {
    const interval = 1000 / MAX_FPS;
    if (this.next !== null && now + 0.1 < this.next) return false;
    this.next = this.next === null || now - this.next >= interval
      ? now + interval : this.next + interval;
    return true;
  }
}
