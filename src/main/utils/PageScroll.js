import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { timingEase } from "@/offscreen/lib/customEases";
import { onTimingChange, timings } from "@/shared/timings";

gsap.registerPlugin(ScrollTrigger);

/** Shared smooth-scroll lifecycle for routed DOM pages. */
export default class PageScroll {
  constructor(api) {
    this.api = api;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    this.lenis.on("scroll", this.update);
    gsap.ticker.add(this.tick);
    gsap.ticker.lagSmoothing(0);
    this.scrollTo(0, { immediate: true });
    this.update();
  }

  update() {
    ScrollTrigger.update();
    const time = performance.timeOrigin + performance.now();
    const scroll = this.lenis.scroll;
    const elapsed = time - (this.lastTime ?? time);
    const velocity = this.lenis.isScrolling && elapsed > 0 && elapsed < 100
      ? (scroll - this.lastScroll) / elapsed : 0;
    this.lastTime = time;
    this.lastScroll = scroll;
    this.api.trigger(
      { name: "pageScroll" },
      { scroll, velocity, time, viewportHeight: window.innerHeight },
    );
  }

  tick(time) {
    this.lenis.raf(time * 1000);
  }

  scrollTo(target, options) {
    this.lenis.scrollTo(target, options);
  }

  resize() {
    this.lenis.resize();
    ScrollTrigger.refresh();
  }

  stop() {
    this.lenis.stop();
  }

  destroy() {
    this.removeTimingListener?.();
    gsap.ticker.remove(this.tick);
    this.lenis.off("scroll", this.update);
    this.lenis.destroy();
    window.scrollTo(0, 0);
    document.body.classList.remove("is-scroll-page");
  }
}
