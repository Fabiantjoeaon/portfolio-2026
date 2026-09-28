import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import dispatcher from "@/shared/dispatcher";
import { timingEase } from "@/offscreen/lib/customEases";
import { onTimingChange, timings } from "@/shared/timings";
import { viewportHeight } from "@/main/utils/viewport";
import { MAX_FPS, UNCAPPED_FPS } from "@/shared/frameLimit";

gsap.registerPlugin(ScrollTrigger);

/**
 * Shared smooth-scroll lifecycle for routed DOM pages.
 *
 * The canvas scrolls with the document (lusionltd/WebGL-Scroll-Sync): it is
 * absolutely positioned and moved to the scroll position of the frame the
 * worker last drew. Native/compositor scrolling between those frames carries
 * the canvas with the DOM, so WebGL content can't drift from its elements.
 */
export default class PageScroll {
  constructor(api) {
    this.api = api;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.canvas = document.querySelector("body > canvas");
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
    this.velocity = 0;
    this.latency = 33;
    this.lastTime = 0;
    this.lastScroll = 0;
    this.sentAt = new Map();
    this.update = this.update.bind(this);
    this.tick = this.tick.bind(this);
    this.onFrame = this.onFrame.bind(this);
    this.lenis.on("scroll", this.update);
    dispatcher.on("pageScrollFrame", this.onFrame);
    // The worker renders every refresh on scroll pages; a 60fps Lenis would
    // scroll the document on alternate refreshes, out of phase with it.
    gsap.ticker.fps(UNCAPPED_FPS);
    gsap.ticker.add(this.tick);
    gsap.ticker.lagSmoothing(0);
    this.scrollTo(0, { immediate: true });
    this.onFrame({ scroll: 0 });
    this.update();
  }

  update() {
    ScrollTrigger.update();
    const now = performance.now();
    const scroll = this.lenis.scroll;
    const dt = now - this.lastTime;
    if (dt > 0 && dt < 100) {
      const velocity = (scroll - this.lastScroll) / dt;
      this.velocity += (velocity - this.velocity) * 0.5;
    } else {
      this.velocity = 0;
    }
    this.lastTime = now;
    this.lastScroll = scroll;
    // Frames reach the screen a round trip after the scroll is sent. Leading
    // by that latency keeps the canvas covering the viewport mid-fling; its
    // position always equals the rendered scroll, so alignment stays exact.
    const lead = this.velocity * Math.min(this.latency, 100);
    this.send(Math.min(Math.max(scroll + lead, 0), this.lenis.limit));
  }

  send(scroll) {
    scroll = Math.round(scroll * 2) / 2;
    if (scroll === this.sentScroll) return;
    this.sentScroll = scroll;
    this.sentAt.set(scroll, performance.now());
    this.api.trigger(
      { name: "pageScroll" },
      { scroll, viewportHeight: viewportHeight() },
    );
  }

  onFrame({ scroll }) {
    if (this.canvas) this.canvas.style.transform = `translate3d(0, ${scroll}px, 0)`;
    const sentAt = this.sentAt.get(scroll);
    if (sentAt === undefined) return;
    this.latency += (performance.now() - sentAt - this.latency) * 0.2;
    for (const key of this.sentAt.keys()) {
      this.sentAt.delete(key);
      if (key === scroll) break;
    }
  }

  tick(time) {
    this.lenis.raf(time * 1000);
    // Settle on the exact position once scrolling stops.
    if (performance.now() - this.lastTime > 80) this.send(this.lenis.scroll);
  }

  scrollTo(target, options) {
    this.lenis.scrollTo(target, options);
  }

  resize() {
    this.lenis.resize();
    ScrollTrigger.refresh();
    this.sentScroll = null;
    this.update();
  }

  stop() {
    this.lenis.stop();
  }

  destroy() {
    this.removeTimingListener?.();
    gsap.ticker.remove(this.tick);
    gsap.ticker.fps(MAX_FPS);
    this.lenis.off("scroll", this.update);
    dispatcher.off("pageScrollFrame", this.onFrame);
    this.lenis.destroy();
    window.scrollTo(0, 0);
    if (this.canvas) this.canvas.style.transform = "";
    document.body.classList.remove("is-scroll-page");
  }
}
