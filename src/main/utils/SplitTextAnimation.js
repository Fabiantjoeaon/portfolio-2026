import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import "@/offscreen/lib/customEases";
import { mainTimings as timings } from "@/shared/timings";

gsap.registerPlugin(SplitText);

// Page wipes can starve the main thread of frames. Reveals advance at most
// MAX_STEP per frame, so they slow down instead of jumping to the end.
const MAX_STEP = 1 / 20;
// smoothChildTiming lets a retargeted reveal resume via totalTime() instead
// of restarting from its start time on the next tick.
const clock = gsap.timeline({ paused: true, autoRemoveChildren: true, smoothChildTiming: true });
gsap.ticker.add((time, deltaTime) => {
  clock.time(clock.time() + Math.min(deltaTime / 1000, MAX_STEP));
});
const play = (targets, vars) => {
  const tween = gsap.to(targets, vars);
  if (vars.duration > 0) clock.add(tween, clock.time());
  return tween;
};
// Horizontal reveal: a soft-edged mask sweeps each line left to right while
// it drifts in by WIPE_DRIFT em.
const WIPE_MASK = "linear-gradient(90deg, #000 calc(var(--wipe) * 150% - 50%), transparent calc(var(--wipe) * 150%))";
const WIPE_DRIFT = 0.6;

/** Owns the split, its resize observer, and interruptible entrance/exit. */
export default class SplitTextAnimation {
  constructor(element, { fade = false } = {}) {
    this.element = element;
    this.fade = fade;
    this.visible = false;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.split = SplitText.create(element, {
      type: "lines",
      mask: "lines",
      autoSplit: true,
      aria: "auto",
      onSplit: (split) => {
        const tween = this.tween;
        if (tween && tween.totalProgress() < 1) {
          // Mobile layout/font changes can rebuild the lines during a reveal.
          // Retarget it without completing its promise or skipping its delay.
          const time = tween.totalTime();
          const delay = Math.max(0, tween.startTime() - tween.parent.time());
          tween.kill();
          gsap.set(split.lines, {
            yPercent: this.visible ? 105 : 0,
            ...(this.fade ? { opacity: this.visible ? 0 : 1 } : {}),
          });
          if (this.wiping) this.setWipe(split, true);
          this.tween = play(split.lines, { ...tween.vars, delay });
          if (time > 0) this.tween.totalTime(time);
          return;
        }
        this.cancel();
        gsap.set(split.lines, { yPercent: this.visible ? 0 : 105, ...(this.fade ? { opacity: this.visible ? 1 : 0 } : {}) });
      },
    });
  }

  cancel() {
    this.tween?.kill();
    this.tween = null;
    if (this.wiping) this.setWipe(this.split, false);
    // A killed animation must also release any awaiting page transition.
    this.resolve?.();
    this.resolve = null;
  }

  setWipe(split, on) {
    this.wiping = on;
    for (const line of split.lines) {
      line.style.maskImage = line.style.webkitMaskImage = on ? WIPE_MASK : "";
      if (!on) line.style.removeProperty("--wipe");
    }
    // The drift would otherwise be cut by each line's clip.
    for (const mask of split.masks) mask.style.overflowX = on ? "visible" : "clip";
    const drift = on ? -WIPE_DRIFT * parseFloat(getComputedStyle(this.element).fontSize) : 0;
    gsap.set(split.lines, on ? { yPercent: 0, x: drift, "--wipe": 0 } : { x: 0 });
  }

  animate(visible, { delay = 0, immediate = false, duration = visible ? timings.text.inDuration : timings.text.outDuration, stagger = visible ? timings.text.inStagger : timings.text.outStagger, ease = timings.text.ease, yOut = -105, wipe = false } = {}) {
    this.cancel();
    this.visible = visible;
    const wiping = visible && wipe && !immediate && !this.reducedMotion;
    if (wiping) this.setWipe(this.split, true);
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.tween = play(this.split.lines, {
        yPercent: visible ? 0 : yOut,
        ...(wiping ? { x: 0, "--wipe": 1 } : {}),
        ...(this.fade ? { opacity: visible ? 1 : 0 } : {}),
        duration: immediate || this.reducedMotion ? 0 : duration,
        delay: this.reducedMotion ? 0 : delay,
        stagger: this.reducedMotion ? 0 : stagger,
        ease,
        overwrite: true,
        // iOS Safari doesn't draw composited lines inside the clip masks of the
        // touch scroller; 2D transforms keep them painting while they move.
        force3D: false,
        onComplete: () => {
          if (this.wiping) this.setWipe(this.split, false);
          this.resolve = null;
          resolve();
        },
      });
    });
  }

  in(options) { return this.animate(true, options); }
  out(options) { return this.animate(false, options); }

  reset() {
    this.cancel();
    this.visible = false;
    gsap.set(this.split.lines, { yPercent: 105, ...(this.fade ? { opacity: 0 } : {}) });
  }

  destroy() {
    this.cancel();
    this.split.revert();
  }
}
