import { getFlag } from "@/offscreen/lib/query";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import PageScroll from "@/main/utils/PageScroll";
import { viewportHeight, visibleViewportHeight } from "@/main/utils/viewport";
import SplitTextAnimation from "@/main/utils/SplitTextAnimation";
import MonoShuffleAnimation from "@/main/utils/MonoShuffleAnimation";
import { formatMonoLabels } from "@/main/utils/monoLabels";
import {
  sectionHead,
  indexRows,
  bindIndexRowHovers,
  diagonalOrder,
  revealSections,
} from "@/main/utils/sections";
import { projectLayout } from "@/shared/projectLayout";
import { PROJECTS, mediaSrc } from "@/shared/projects";
import "@/offscreen/lib/customEases";
import { mainTimings as timings } from "@/shared/timings";

gsap.registerPlugin(ScrollTrigger);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const number = (value) => String(value).padStart(2, "0");

export default class ProjectPage {
  constructor(api, project, dispatcher, navigate) {
    this.api = api;
    this.project = project;
    this.dispatcher = dispatcher;
    this.splits = [];
    this.monos = [];
    this.monoByElement = new Map();
    this.triggers = [];
    this.events = new AbortController();
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.element = document.createElement("main");
    this.element.className = "project-page";
    this.element.style.visibility = "hidden";
    const slides = project.slideCount || project.media.length;
    const nextIndex = (PROJECTS.indexOf(project) + 1) % PROJECTS.length;
    const next = PROJECTS[nextIndex];
    const roles = project.role
      .split(/\s*(?:,|&)\s*/)
      .map((role) => role.charAt(0).toUpperCase() + role.slice(1));
    this.element.innerHTML = `
      <section class="project-hero" aria-labelledby="project-title">
        <div class="project-heading">
          <h1 id="project-title" class="project-title" data-reveal>${escape(project.name)}</h1>
          ${project.url ? `<a class="project-visit" href="${escape(project.url)}" target="_blank" rel="noopener noreferrer"><span data-mono>Visit project</span> <span aria-hidden="true">↗</span></a>` : ""}
        </div>
        <div class="project-gallery" role="region" aria-roledescription="carousel" aria-label="${escape(project.name)} gallery" tabindex="0">
          <button class="project-preview project-preview-prev" type="button" aria-label="Previous image" data-step="-1"></button>
          <div class="project-media-frame" role="img" aria-label="${escape(project.media[0].alt)}"></div>
          <button class="project-preview project-preview-next" type="button" aria-label="Next image" data-step="1"></button>
        </div>
        <div class="project-hero-caption">
          <dl class="project-metadata">
            ${[
              ["Client", project.client],
              ["Agency", project.agency],
              ["Year", project.year],
            ]
              .map(
                ([label, value]) =>
                  `<div><dt data-mono data-reveal>${label}</dt><dd data-reveal>${escape(value)}</dd></div>`,
              )
              .join("")}
          </dl>
          <div class="project-hero-nav">
            <div class="project-pagination" aria-label="Choose a slide">
              ${project.media
                .slice(0, slides)
                .map(
                  (media, index) =>
                    `<button type="button" data-index="${index}" data-mono aria-label="Show slide ${index + 1}: ${escape(media.alt)}" ${index === 0 ? 'aria-current="true"' : ""}>${number(index + 1)}</button>`,
                )
                .join("")}
              <i class="project-pagination-bar" aria-hidden="true"></i>
              <span class="project-pagination-count" data-mono aria-hidden="true">${number(1)} / ${number(slides)}</span>
            </div>
            <button class="project-scroll-hint" type="button" data-scroll-details aria-label="Scroll to project details"><span data-mono>Scroll</span><i class="project-scroll-line" aria-hidden="true"></i></button>
          </div>
          <p class="sr-only project-slide-status" aria-live="polite" aria-atomic="true"></p>
        </div>
      </section>
      <div class="page-details project-details">
        <section class="page-section" aria-labelledby="project-overview">
          ${sectionHead({ id: "project-overview", index: "01", label: "Overview", detail: "The brief" })}
          <p class="section-statement" data-reveal><span class="statement-indent" aria-hidden="true"></span>${escape(project.description)}</p>
        </section>
        <section class="page-section" aria-labelledby="project-contribution">
          ${sectionHead({ id: "project-contribution", index: "02", label: "Contribution", detail: "My role" })}
          <dl class="project-contribution">
            <div><dt data-mono>Disciplines</dt>${roles.map((role) => `<dd data-reveal>${escape(role)}</dd>`).join("")}</div>
            ${project.approach ? `<div><dt data-mono>Approach</dt><dd class="project-body-copy" data-reveal>${escape(project.approach)}</dd></div>` : ""}
          </dl>
        </section>
        ${
          project.awards.length
            ? `
        <section class="page-section" aria-labelledby="project-awards">
          ${sectionHead({ id: "project-awards", index: "03", label: "Awards", detail: number(project.awards.length) })}
          <ul class="index-table project-awards">${indexRows(project.awards)}</ul>
        </section>`
            : ""
        }
        ${
          project.details.length
            ? `<div class="project-stills">
          ${project.details.map((mediaIndex, index, list) => `<figure><div class="project-still-image" role="img" aria-label="${escape(project.media[mediaIndex].alt)}" data-media="${mediaIndex}"></div><figcaption><span data-mono>Detail ${number(index + 1)}</span><span data-mono aria-hidden="true">${number(index + 1)} / ${number(list.length)}</span></figcaption></figure>`).join("")}
        </div>`
            : ""
        }
        <footer class="page-footer project-footer">
          <i class="section-rule" aria-hidden="true"></i>
          <a class="project-next" href="/project/${next.slug}">
            <span class="project-next-label" data-mono>Next project</span>
            <span class="project-next-name" data-reveal>${escape(next.name)}</span>
            <span class="project-next-credit" data-mono aria-hidden="true">${escape(next.client)} — ${escape(next.year)}</span>
          </a>
          <div class="footer-bar">
            <a href="/" data-mono>All projects</a>
            <span data-mono aria-hidden="true">${number(nextIndex + 1)} / ${number(PROJECTS.length)}</span>
          </div>
        </footer>
      </div>`;
    formatMonoLabels(this.element);
    document.querySelector("#app").appendChild(this.element);
    this.resize = this.resize.bind(this);
    this.layout();
    // The mobile footer sizes itself around this so "Next project" still centers in the vortex eye.
    this.nextObserver = new ResizeObserver(([entry]) => {
      this.element.style.setProperty("--project-nextHeight", `${entry.borderBoxSize[0].blockSize}px`);
      this.scroll?.resize();
    });
    this.nextObserver.observe(this.element.querySelector(".project-next"));
    this.gallery = this.element.querySelector(".project-gallery");
    this.pageButtons = [
      ...this.element.querySelectorAll(".project-pagination [data-index]"),
    ];
    for (const button of this.pageButtons)
      button.dataset.label = button.textContent;
    this.bar = this.element.querySelector(".project-pagination-bar");
    gsap.set(this.element.querySelector(".project-scroll-line"), {
      scaleY: 0,
      transformOrigin: "50% 0%",
    });
    this.slideIndex = 0;
    this.onSlide = async (data) => {
      const slug = await data.slug;
      const index = await data.index;
      const busy = await data.busy;
      if (this.destroyed || slug !== project.slug) return;
      this.gallery.setAttribute("aria-busy", String(busy));
      if (index !== this.slideIndex) {
        for (const button of this.pageButtons) {
          const current = Number(button.dataset.index) === index;
          if (current) button.setAttribute("aria-current", "true");
          else button.removeAttribute("aria-current");
          if (current) this.monoByElement.get(button)?.to(button.dataset.label);
        }
        this.slideIndex = index;
        this.moveBar();
        const count = this.element.querySelector(".project-pagination-count");
        this.monoByElement
          .get(count)
          ?.to(`${number(index + 1)} / ${number(slides)}`);
      }
      const media = project.media[index];
      this.element
        .querySelector(".project-media-frame")
        .setAttribute("aria-label", media.alt);
      this.element.querySelector(".project-slide-status").textContent =
        `Slide ${index + 1} of ${slides}. ${media.alt}`;
    };
    dispatcher.on("projectSlideChanged", this.onSlide);
    this.galleryEntered = new Promise((resolve) => {
      this.onGalleryEntered = async (data) => {
        if ((await data.slug) === project.slug) resolve();
      };
    });
    dispatcher.on("projectGalleryEntered", this.onGalleryEntered);
    this.element.addEventListener(
      "click",
      (event) => {
        if (this.leaving || this.suppressClickUntil > performance.now()) return;
        const target = event.target.closest("button, a");
        if (!target) return;
        if (target.matches("[data-step]"))
          this.change({ step: Number(target.dataset.step) });
        if (target.matches("[data-index]"))
          this.change({ index: Number(target.dataset.index) });
        if (target.matches("[data-scroll-details]"))
          this.scroll?.scrollTo(this.element.querySelector(".project-details"));
        if (
          target.tagName === "A" &&
          target.host === window.location.host &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          navigate(target.getAttribute("href"));
        }
      },
      { signal: this.events.signal },
    );
    this.gallery.addEventListener(
      "keydown",
      (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        if (event.key === "Home") this.change({ index: 0 });
        else if (event.key === "End") this.change({ index: slides - 1 });
        else this.change({ step: event.key === "ArrowRight" ? 1 : -1 });
      },
      { signal: this.events.signal },
    );
    this.samples = Array.from({ length: 8 }, () => ({ x: 0, time: 0 }));
    this.gallery.addEventListener(
      "pointerdown",
      (event) => {
        if (!event.isPrimary || event.button !== 0) return;
        this.pointer = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          lastX: event.clientX,
          axis: null,
        };
        this.sampleCount = 0;
        this.recordSample(event);
        event.target.setPointerCapture(event.pointerId);
      },
      { signal: this.events.signal },
    );
    this.gallery.addEventListener(
      "pointermove",
      (event) => {
        const pointer = this.pointer;
        if (!pointer || pointer.id !== event.pointerId) return;
        const dx = event.clientX - pointer.x;
        const dy = event.clientY - pointer.y;
        // Vertical gestures scroll the page, so any horizontal-leaning start
        // belongs to the gallery.
        if (!pointer.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
          pointer.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
          if (pointer.axis === "x") {
            this.change({ phase: "grab" });
            this.gallery.classList.add("is-dragging");
          }
        }
        this.recordSample(event);
        if (pointer.axis !== "x") return;
        pointer.lastX = event.clientX;
        this.change({ phase: "drag", distance: -dx / this.pitch });
      },
      { signal: this.events.signal },
    );
    const endPointer = (event, cancelled = false) => {
      const pointer = this.pointer;
      if (!pointer || pointer.id !== event.pointerId) return;
      this.pointer = null;
      this.gallery.classList.remove("is-dragging");
      if (pointer.axis !== "x") return;
      this.suppressClickUntil = performance.now() + 350;
      if (!cancelled) this.recordSample(event);
      this.change({
        phase: "drag",
        distance:
          (pointer.x - (cancelled ? pointer.lastX : event.clientX)) /
          this.pitch,
      });
      this.change({
        phase: "release",
        velocity: this.releaseVelocity(event.timeStamp),
      });
    };
    // Lenis drives touch scrolling; a horizontal drag must not also move the page.
    this.gallery.addEventListener(
      "touchmove",
      (event) => {
        if (this.pointer?.axis === "x") event.lenisStopPropagation = true;
      },
      { signal: this.events.signal },
    );
    this.gallery.addEventListener("pointerup", (event) => endPointer(event), {
      signal: this.events.signal,
    });
    this.gallery.addEventListener(
      "pointercancel",
      (event) => endPointer(event, true),
      { signal: this.events.signal },
    );
    this.gallery.addEventListener(
      "lostpointercapture",
      (event) => endPointer(event, true),
      { signal: this.events.signal },
    );
    this.gallery.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey || this.pointer?.axis === "x") return;
        const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
        if (!horizontal && !event.shiftKey) return;
        const delta = horizontal ? event.deltaX : event.deltaY;
        if (!delta) return;
        event.preventDefault();
        event.stopPropagation();
        const units =
          event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? window.innerWidth
              : 1;
        this.change({ phase: "wheel", distance: (delta * units) / this.pitch });
      },
      { passive: false, signal: this.events.signal },
    );
    this.prepared = this.prepare();
  }

  /** Split and hide every label ahead of the page transition; animations start in open(). */
  async prepare() {
    await document.fonts.ready;
    if (this.destroyed) return;
    for (const element of this.element.querySelectorAll("[data-mono]")) {
      const mono = new MonoShuffleAnimation(element);
      this.monos.push(mono);
      this.monoByElement.set(element, mono);
      mono.reset();
    }
    bindIndexRowHovers(this.element, this.monos);
    for (const element of this.element.querySelectorAll("[data-reveal]")) {
      if (element.matches("[data-mono]")) continue;
      this.splits.push(
        new SplitTextAnimation(element, {
          fade: Boolean(element.closest(".project-hero")),
        }),
      );
    }
  }

  open() {
    document.body.classList.add("is-project");
    this.scroll = new PageScroll(this.api, this.element);
    this.scrollHintHidden = false;
    this.scroll.lenis.on("scroll", (lenis) =>
      this.updateScrollHint(lenis.scroll),
    );
    window.addEventListener("resize", this.resize, {
      signal: this.events.signal,
    });
    this.resize();
    const hero = this.element.querySelector(".project-hero");
    this.heroOrder = diagonalOrder(
      [
        ...hero.querySelectorAll(
          "[data-mono], [data-reveal], .project-media-frame",
        ),
      ].filter((element) => !element.closest(".project-hero-nav")),
    );
    this.api.trigger(
      { name: "projectGallery" },
      {
        slug: this.project.slug,
        activate: true,
        immediate: this.reducedMotion,
        delay: this.heroDelay(hero.querySelector(".project-media-frame")),
      },
    );
    this.ready = this.prepared.then(() => this.initAnimations());
  }

  heroDelay(element) {
    if (this.reducedMotion) return 0;
    const { delay, stagger } = timings.contentReveal;
    return delay + this.heroOrder.indexOf(element) * stagger;
  }

  moveBar(immediate = false, delay = 0) {
    const button = this.pageButtons?.[this.slideIndex];
    if (!button) return;
    const inset = 8;
    gsap.to(this.bar, {
      x: button.offsetLeft + inset,
      scaleX: this.navRevealed
        ? Math.max(1, button.offsetWidth - inset * 2)
        : 0,
      delay,
      duration:
        immediate || this.reducedMotion ? 0 : timings.pagination.barDuration,
      ease: timings.pagination.barEase,
      overwrite: true,
    });
  }

  /** Slide numbers, the active bar, the counter and the scroll hint, in order, once the cards are in. */
  revealNav() {
    if (this.destroyed || this.leaving) return;
    this.navRevealed = true;
    const { introStagger, introDuration, introEase } = timings.pagination;
    const stagger = this.reducedMotion ? 0 : introStagger;
    const duration = this.reducedMotion ? 0 : introDuration;
    this.pageButtons.forEach((button, index) =>
      this.monoByElement.get(button)?.in({ delay: index * stagger }),
    );
    gsap.to(this.pageButtons, {
      "--segment-reveal": 1,
      duration,
      ease: introEase,
      stagger,
    });
    this.moveBar(false, (this.slideIndex + 1) * stagger);
    const after = this.pageButtons.length * stagger;
    this.monoByElement
      .get(this.element.querySelector(".project-pagination-count"))
      ?.in({ delay: after });
    const hint = this.element.querySelector(".project-scroll-hint");
    if (!this.scrollHintHidden)
      this.monoByElement.get(hint.firstElementChild)?.in({ delay: after + stagger });
    gsap.to(hint.querySelector(".project-scroll-line"), {
      scaleY: 1,
      delay: after + stagger * 2,
      duration,
      ease: introEase,
    });
  }

  recordSample(event) {
    const sample = this.samples[this.sampleCount++ % this.samples.length];
    sample.x = event.clientX;
    sample.time = event.timeStamp;
  }

  /** Slides per second over the last 80ms; zero once the pointer has come to rest. */
  releaseVelocity(now) {
    const length = this.samples.length;
    const last = this.samples[(this.sampleCount - 1) % length];
    if (!this.sampleCount || now - last.time > 80) return 0;
    let first = last;
    for (let i = 2; i <= Math.min(this.sampleCount, length); i++) {
      const sample = this.samples[(this.sampleCount - i) % length];
      if (last.time - sample.time > 80) break;
      first = sample;
    }
    const seconds = (last.time - first.time) / 1000;
    return seconds > 0.004 ? (first.x - last.x) / this.pitch / seconds : 0;
  }

  change(request) {
    if (this.leaving || this.destroyed) return;
    this.api.trigger(
      { name: "projectGallery" },
      { slug: this.project.slug, ...request, immediate: this.reducedMotion },
    );
  }

  layout() {
    const layout = projectLayout(
      window.innerWidth,
      viewportHeight(),
      getFlag("touchExperience") || window.innerWidth <= 700,
      visibleViewportHeight(),
    );
    this.element.style.setProperty(
      "--project-viewportHeight",
      `${viewportHeight()}px`,
    );
    this.pitch = layout.mediaWidth + layout.gap;
    for (const key of [
      "heroHeight",
      "mediaWidth",
      "mediaHeight",
      "gap",
      "top",
      "left",
    ]) {
      this.element.style.setProperty(`--project-${key}`, `${layout[key]}px`);
    }
    // Mobile, or too many numbers for the row: segments and a counter instead.
    const pagination = this.element.querySelector(".project-pagination");
    const hint = this.element.querySelector(".project-scroll-hint");
    pagination.classList.remove("is-compact");
    const room = pagination.parentElement.clientWidth - hint.offsetWidth - 24;
    pagination.classList.toggle(
      "is-compact",
      getFlag("touchExperience") ||
        window.innerWidth <= 700 ||
        pagination.scrollWidth > room,
    );
  }

  updateScrollHint(scroll) {
    const hidden = scroll > 24;
    if (hidden === this.scrollHintHidden) return;
    this.scrollHintHidden = hidden;
    const hint = this.element.querySelector(".project-scroll-hint");
    hint.classList.toggle("is-hidden", hidden);
    const mono = this.monoByElement.get(hint.firstElementChild);
    if (mono && this.navRevealed) hidden ? mono.out() : mono.in();
  }

  resize() {
    const size = `${window.innerWidth}x${viewportHeight()}`;
    if (size === this.size) return;
    this.size = size;
    if (this.pointer?.axis === "x") {
      this.change({ phase: "release" });
      this.pointer = null;
      this.gallery.classList.remove("is-dragging");
    }
    this.layout();
    this.fitStills();
    this.scroll?.resize();
    this.measureStills();
    this.moveBar(true);
  }

  /** Stacked stills take their media's own aspect, so they render whole without the blur fill. */
  fitStills() {
    const grid = this.element.querySelector(".project-stills");
    if (!grid) return;
    this.stillsStacked = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length === 1;
    const touch = getFlag("touchExperience");
    for (const element of grid.querySelectorAll(".project-still-image")) {
      const { width, height } = mediaSrc(this.project.media[Number(element.dataset.media)], touch);
      element.style.aspectRatio = this.stillsStacked ? `${width} / ${height}` : "";
    }
  }

  measureStills() {
    const frame = this.element
      .querySelector(".project-media-frame")
      .getBoundingClientRect();
    const stills = [
      ...this.element.querySelectorAll(".project-still-image"),
    ].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        mediaIndex: Number(element.dataset.media),
        x: rect.left + rect.width / 2 - (frame.left + frame.width / 2),
        y: rect.top + rect.height / 2 - (frame.top + frame.height / 2),
        width: rect.width,
        height: rect.height,
      };
    });
    this.api.trigger(
      { name: "projectGallery" },
      { slug: this.project.slug, stills },
    );
  }

  initAnimations() {
    if (this.destroyed || this.leaving) return;
    const { duration } = timings.contentReveal;
    const scrollReveals = new Map();
    for (const mono of this.monos) {
      if (mono.element.closest(".project-hero-nav")) continue;
      if (mono.element.closest(".project-hero"))
        mono.in({ delay: this.heroDelay(mono.element) });
      else scrollReveals.set(mono.element, (delay) => mono.in({ delay }));
    }
    for (const split of this.splits) {
      const element = split.element;
      if (element.closest(".project-hero"))
        split.in({
          delay: this.heroDelay(element),
          duration,
          stagger: timings.text.heroLineStagger,
          ease: timings.text.heroEase,
        });
      else scrollReveals.set(element, (delay) => split.in({ delay }));
    }
    this.element
      .querySelectorAll(".project-still-image")
      .forEach((element, revealStill) => {
        scrollReveals.set(element, (delay) =>
          gsap.delayedCall(delay, () => this.change({ revealStill })),
        );
      });
    this.triggers.push(
      ...revealSections(this.element, scrollReveals, this.reducedMotion),
      ScrollTrigger.create({
        trigger: this.element.querySelector(".project-next"),
        start: "top 85%",
        onToggle: ({ isActive }) => this.change({ skyScrolled: isActive }),
      }),
    );
    this.element.style.visibility = "";
    this.measureStills();
    this.moveBar(true);
    this.galleryEntered.then(() => this.revealNav());
    this.scroll.resize();
  }

  out() {
    return (this.exitPromise ??= this.animateOut());
  }

  async animateOut() {
    this.leaving = true;
    this.scroll?.stop();
    this.triggers.forEach((trigger) => trigger.kill());
    this.fade?.kill();
    this.fade = gsap.to(this.element, {
      opacity: 0,
      duration: this.reducedMotion ? 0 : timings.text.exitFade,
      ease: timings.text.exitEase,
    });
    await Promise.all([
      this.fade,
      ...this.monos.filter((mono) => mono.visible).map((mono) => mono.out()),
    ]);
  }

  destroy() {
    this.destroyed = true;
    this.events.abort();
    this.nextObserver.disconnect();
    this.dispatcher.off("projectSlideChanged", this.onSlide);
    this.dispatcher.off("projectGalleryEntered", this.onGalleryEntered);
    this.triggers.forEach((trigger) => trigger.kill());
    this.fade?.kill();
    gsap.killTweensOf([
      this.bar,
      ...this.pageButtons,
      this.element.querySelector(".project-scroll-line"),
      ...this.element.querySelectorAll(".section-rule"),
    ]);
    this.splits.forEach((split) => split.destroy());
    this.monos.forEach((mono) => mono.destroy());
    this.monoByElement.clear();
    this.scroll?.destroy();
    this.element.remove();
    if (this.scroll) document.body.classList.remove("is-project");
  }
}
