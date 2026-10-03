import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import dispatcher from "@/shared/dispatcher";
import { timingEase } from "@/offscreen/lib/customEases";
import { onTimingChange, timings } from "@/shared/timings";
import { viewportHeight } from "@/main/utils/viewport";
import { getFlag } from "@/offscreen/lib/query";

gsap.registerPlugin(ScrollTrigger);

const snap = (scroll) => Math.round(scroll * 2) / 2;
const VELOCITY_SMOOTHING = 32;

/**
 * Shared smooth-scroll lifecycle for routed DOM pages.
 *
 * The canvas scrolls with the document (lusionltd/WebGL-Scroll-Sync): it is
 * absolutely positioned and moved to the scroll position of the frame the
 * worker last drew. Native/compositor scrolling between those frames carries
 * the canvas with the DOM, so WebGL content can't drift from its elements.
 *
 * Lenis-driven scrolls (wheel, scrollTo) don't touch the document until the
 * worker has drawn that position; document and canvas then move on the same
 * frame, so both run at the worker's capped rate without drifting apart.
 *
 * Touch keeps the canvas fixed and lets Lenis drive touch scrolling too, so
 * the document only moves to positions the worker has drawn: DOM-locked
 * content and its elements step together, and backdrops ease. That scroll
 * moves #app rather than the document: Safari clips fixed elements at its
 * toolbars, so the copy then ends where the canvas does. Native touch
 * scrolling (reduced motion) stays on the document, as #app lets touches
 * through to the canvas.
 */
export default class PageScroll {
  constructor(api, content) {
    this.api = api;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.canvas = document.querySelector("body > canvas");
    this.pinnedCanvas = getFlag("touchExperience");
    const ownsTouch = this.pinnedCanvas && !this.reducedMotion;
    this.scroller = ownsTouch ? document.querySelector("#app") : document.scrollingElement;
    document.body.classList.add("is-scroll-page");
    document.body.classList.toggle("is-scroll-contained", ownsTouch);
    ScrollTrigger.defaults({ scroller: this.scroller });
    document.querySelector(".three-inspector")?.setAttribute("data-lenis-prevent", "");
    this.lenis = new Lenis({
      wrapper: this.scroller,
      content: ownsTouch ? content : document.documentElement,
      eventsTarget: window,
      smoothWheel: !this.reducedMotion,
      syncTouch: ownsTouch,
      duration: timings.scroll.duration,
      lerp: 0,
      easing: timingEase(timings.scroll.ease),
      prevent: (node) => node.classList?.contains("three-inspector"),
    });
    this.domTarget = null;
    this.lenis.setScroll = (scroll) => {
      this.domTarget = snap(scroll);
    };
    // Lenis resyncs from the document on reset/resize; report the pending
    // position so a not-yet-applied scroll isn't undone.
    Object.defineProperty(this.lenis, "actualScroll", {
      get: () => this.domTarget ?? this.scroller.scrollTop,
    });
    this.removeTimingListener = onTimingChange(({ group }) => {
      if (group !== 'scroll') return;
      this.lenis.options.duration = timings.scroll.duration;
      this.lenis.options.easing = timingEase(timings.scroll.ease);
    });
    this.velocity = 0;
    this.latency = 33;
    this.shownSentAt = null;
    this.lastTime = 0;
    this.lastScroll = 0;
    this.sentAt = new Map();
    this.update = this.update.bind(this);
    this.tick = this.tick.bind(this);
    this.onFrame = this.onFrame.bind(this);
    this.lenis.on("scroll", this.update);
    dispatcher.on("pageScrollFrame", this.onFrame);
    gsap.ticker.add(this.tick);
    gsap.ticker.lagSmoothing(0);
    this.scrollTo(0, { immediate: true });
    this.onFrame({ scroll: 0 });
    this.update();
  }

  update() {
    if (this.domTarget !== null) {
      this.send(this.domTarget, true);
      return;
    }
    ScrollTrigger.update();
  }

  // Native (touch, keyboard, scrollbar) scrolling is sampled once per frame:
  // scroll events arrive irregularly, and any noise in the lead below shows
  // up as jitter in everything on the canvas that isn't locked to the DOM.
  track() {
    const now = performance.now();
    const scroll = this.lenis.scroll;
    // A frame that arrived since the last tick is first painted now.
    if (this.shownSentAt !== null) {
      this.latency += (now - this.shownSentAt - this.latency) * 0.2;
      this.shownSentAt = null;
    }
    const dt = now - this.lastTime;
    if (dt <= 0) return;
    const velocity = dt < 100 ? (scroll - this.lastScroll) / dt : 0;
    this.velocity += (velocity - this.velocity) * (1 - Math.exp(-dt / VELOCITY_SMOOTHING));
    this.lastTime = now;
    this.lastScroll = scroll;
    if (this.domTarget !== null || this.lenis.isScrolling === "smooth") return;
    // Frames reach the screen a round trip after the scroll is sent. Leading
    // by that latency keeps a carried canvas covering the viewport, and puts
    // a pinned canvas's DOM-locked content where the page is when it shows.
    const lead = Math.abs(this.velocity) < 0.01 ? 0 : this.velocity * Math.min(this.latency, 100);
    this.send(Math.min(Math.max(scroll + lead, 0), this.lenis.limit));
  }

  send(scroll, applyToDocument = false) {
    scroll = snap(scroll);
    if (scroll === this.sentScroll) {
      if (!applyToDocument) return;
      const pending = this.sentAt.get(scroll);
      if (pending) pending.applyToDocument = true;
      else this.applyToDocument(scroll);
      return;
    }
    this.sentScroll = scroll;
    this.sentAt.set(scroll, { time: performance.now(), applyToDocument });
    this.api.trigger(
      { name: "pageScroll" },
      { scroll, viewportHeight: viewportHeight() },
    );
  }

  onFrame({ scroll }) {
    const sent = this.sentAt.get(scroll);
    if (sent?.applyToDocument) this.applyToDocument(scroll);
    if (this.canvas && !this.pinnedCanvas) this.canvas.style.transform = `translate3d(0, ${scroll}px, 0)`;
    if (sent === undefined) return;
    this.shownSentAt = sent.time;
    for (const key of this.sentAt.keys()) {
      this.sentAt.delete(key);
      if (key === scroll) break;
    }
  }

  applyToDocument(scroll) {
    if (scroll === this.domTarget) this.domTarget = null;
    if (Math.abs(this.scroller.scrollTop - scroll) >= 0.5) {
      this.lenis.preventNextNativeScrollEvent();
      this.scroller.scrollTo({ top: scroll, behavior: "instant" });
    }
    ScrollTrigger.update();
  }

  tick(time) {
    this.lenis.raf(time * 1000);
    this.track();
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
    this.lenis.off("scroll", this.update);
    dispatcher.off("pageScrollFrame", this.onFrame);
    this.lenis.destroy();
    this.scroller.scrollTo(0, 0);
    if (this.canvas) this.canvas.style.transform = "";
    document.body.classList.remove("is-scroll-page", "is-scroll-contained");
  }
}
