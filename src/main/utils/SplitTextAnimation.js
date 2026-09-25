import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { CUSTOM_EASE } from "@/offscreen/lib/customEases";

gsap.registerPlugin(SplitText);

/** Owns the split, its resize observer, and interruptible entrance/exit. */
export default class SplitTextAnimation {
  constructor(element) {
    this.element = element;
    this.visible = false;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.split = SplitText.create(element, {
      type: "lines",
      mask: "lines",
      autoSplit: true,
      aria: "auto",
      onSplit: (split) => {
        this.cancel();
        gsap.set(split.lines, { yPercent: this.visible ? 0 : 105 });
      },
    });
  }

  cancel() {
    this.tween?.kill();
    this.tween = null;
    // A killed animation must also release any awaiting page transition.
    this.resolve?.();
    this.resolve = null;
  }

  animate(visible, { delay = 0, immediate = false, duration = visible ? 1.15 : 0.45, stagger = visible ? 0.065 : 0.025 } = {}) {
    this.cancel();
    this.visible = visible;
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.tween = gsap.to(this.split.lines, {
        yPercent: visible ? 0 : -105,
        duration: immediate || this.reducedMotion ? 0 : duration,
        delay: this.reducedMotion ? 0 : delay,
        stagger: this.reducedMotion ? 0 : stagger,
        ease: CUSTOM_EASE,
        overwrite: true,
        onComplete: () => {
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
    gsap.set(this.split.lines, { yPercent: 105 });
  }

  destroy() {
    this.cancel();
    this.split.revert();
  }
}
