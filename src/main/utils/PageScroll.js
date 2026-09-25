import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { timingEase } from "@/offscreen/lib/customEases";
import { timings } from "@/shared/timings";

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
    this.api.trigger(
      { name: "pageScroll" },
      { scroll: this.lenis.scroll, viewportHeight: window.innerHeight },
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
    gsap.ticker.remove(this.tick);
    this.lenis.off("scroll", this.update);
    this.lenis.destroy();
    window.scrollTo(0, 0);
    document.body.classList.remove("is-scroll-page");
  }
}
