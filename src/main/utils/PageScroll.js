import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { timingEase } from "@/offscreen/lib/customEases";
import { onTimingChange, timings } from "@/shared/timings";

gsap.registerPlugin(ScrollTrigger);

/**
 * Shared smooth-scroll lifecycle for routed DOM pages.
 *
 * The canvas scrolls with the document (lusionltd/WebGL-Scroll-Sync): it is
 * absolutely positioned and moved to the scroll position the worker renders.
 * Native/compositor scrolling between updates carries the canvas with the
 * DOM, so WebGL content can't drift from its elements on touch devices.
 */
export default class PageScroll {
  constructor(api) {
    this.api = api;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.canvas = document.querySelector("body > canvas");
    this.canvasHeight = this.canvas?.style.height;
    document.body.classList.add("is-scroll-page");
    document.querySelector(".three-inspector")?.setAttribute("data-lenis-prevent", "");
    this.lenis = new Lenis({
      smoothWheel: !this.reducedMotion,
      duration: timings.scroll.duration,
      lerp: 0,
      easing: timingEase(timings.scroll.ease),
      prevent: (node) => node.classList?.contains("three-inspector"),
    });
    this.removeTimingListener = onTimingChange(({ group }) => {
      if (group !== 'scroll') return;
      this.lenis.options.duration = timings.scroll.duration;
      this.lenis.options.easing = timingEase(timings.scroll.ease);
    });
    this.update = this.update.bind(this);
    this.tick = this.tick.bind(this);
    this.onResize = () => { this.fitCanvas(); this.update(); };
    window.addEventListener("resize", this.onResize);
    this.lenis.on("scroll", this.update);
    gsap.ticker.add(this.tick);
    gsap.ticker.lagSmoothing(0);
    this.scrollTo(0, { immediate: true });
    this.fitCanvas();
    this.update();
  }

  update() {
    ScrollTrigger.update();
    const scroll = this.lenis.scroll;
    if (this.canvas) this.canvas.style.transform = `translate3d(0, ${scroll}px, 0)`;
    this.api.trigger(
      { name: "pageScroll" },
      { scroll, viewportHeight: window.innerHeight },
    );
  }

  // Match the drawing buffer (sized from innerHeight) instead of 100vh, which
  // differs from innerHeight while mobile browser bars are visible.
  fitCanvas() {
    if (this.canvas) this.canvas.style.height = `${window.innerHeight}px`;
  }

  tick(time) {
    this.lenis.raf(time * 1000);
  }

  scrollTo(target, options) {
    this.lenis.scrollTo(target, options);
  }

  resize() {
    this.fitCanvas();
    this.lenis.resize();
    ScrollTrigger.refresh();
    this.update();
  }

  stop() {
    this.lenis.stop();
  }

  destroy() {
    this.removeTimingListener?.();
    window.removeEventListener("resize", this.onResize);
    gsap.ticker.remove(this.tick);
    this.lenis.off("scroll", this.update);
    this.lenis.destroy();
    window.scrollTo(0, 0);
    if (this.canvas) {
      this.canvas.style.transform = "";
      this.canvas.style.height = this.canvasHeight;
    }
    document.body.classList.remove("is-scroll-page");
  }
}
