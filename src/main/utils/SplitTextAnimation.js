import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import "@/offscreen/lib/customEases";
import { mainTimings as timings } from "@/shared/timings";

gsap.registerPlugin(SplitText, ScrollTrigger);

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

/**
 * Owns the split, its resize observer, and interruptible entrance/exit.
 * Lines slide up through their masks; with `chars`, each character slides
 * up through its line's mask instead.
 */
export default class SplitTextAnimation {
  constructor(element, { chars = false } = {}) {
    this.element = element;
    this.chars = chars;
    this.visible = false;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.split = SplitText.create(element, {
      type: chars ? "lines, chars" : "lines",
      mask: "lines",
      autoSplit: true,
      aria: "auto",
      onSplit: (split) => {
        if (this.scrollVars) {
          this.killScroll();
          gsap.set(split.lines, this.state(false));
          this.bindScroll(split);
          return;
        }
        const tween = this.tween;
        if (tween && tween.totalProgress() < 1) {
          // Mobile layout/font changes can rebuild the lines during a reveal.
          // Retarget it without completing its promise or skipping its delay.
          const time = tween.totalTime();
          const delay = Math.max(0, tween.startTime() - tween.parent.time());
          tween.kill();
          gsap.set(this.parts(split), this.state(!this.visible));
          if (this.wiping) this.setWipe(split, true);
          this.tween = play(this.parts(split), { ...tween.vars, delay });
          if (time > 0) this.tween.totalTime(time);
          return;
        }
        this.cancel();
        gsap.set(this.parts(split), this.state(this.visible));
      },
    });
  }

  parts(split = this.split) {
    return this.chars ? split.chars : split.lines;
  }

  /** Hidden parts sit `y` percent down; exits pass a negative `y` to leave upwards. */
  state(visible, y = 105) {
    return { yPercent: visible ? 0 : y };
  }

  cancel() {
    this.tween?.kill();
    this.tween = null;
    if (this.scrollVars) {
      this.killScroll();
      this.scrollVars = null;
    }
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
    const wiping = visible && wipe && !this.chars && !immediate && !this.reducedMotion;
    if (wiping) this.setWipe(this.split, true);
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.tween = play(this.parts(), {
        ...this.state(visible, yOut),
        ...(wiping ? { x: 0, "--wipe": 1 } : {}),
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

  /** Each line rises as it scrolls into view, but never before `delay` seconds from now. */
  scrollIn({ delay = 0, duration = timings.text.inDuration, stagger = timings.text.inStagger, ease = timings.text.ease } = {}) {
    this.cancel();
    this.visible = true;
    this.scrollVars = { from: gsap.ticker.time + delay, duration, stagger, ease };
    this.bindScroll(this.split);
  }

  bindScroll(split) {
    const { from, duration, stagger, ease } = this.scrollVars;
    const lines = new Map(split.masks.map((mask, index) => [mask, split.lines[index]]));
    this.scrollTweens = [];
    this.scrollTriggers = ScrollTrigger.batch(split.masks, {
      start: `clamp(top ${timings.scrollReveal.triggerAt * 100}%)`,
      once: true,
      onEnter: (masks) => {
        const reduced = this.reducedMotion;
        this.scrollTweens.push(play(masks.map((mask) => lines.get(mask)), {
          ...this.state(true),
          duration: reduced ? 0 : duration,
          delay: reduced ? 0 : Math.max(0, from - gsap.ticker.time),
          stagger: reduced ? 0 : stagger,
          ease,
          overwrite: true,
          force3D: false,
        }));
      },
    });
  }

  killScroll() {
    this.scrollTriggers?.forEach((trigger) => trigger.kill());
    this.scrollTweens?.forEach((tween) => tween.kill());
    this.scrollTriggers = this.scrollTweens = null;
  }

  in(options) { return this.animate(true, options); }
  out(options) { return this.animate(false, options); }

  reset() {
    this.cancel();
    this.visible = false;
    gsap.set(this.parts(), this.state(false));
  }

  destroy() {
    this.cancel();
    this.split.revert();
  }
}
