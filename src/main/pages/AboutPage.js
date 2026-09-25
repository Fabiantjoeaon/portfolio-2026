import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import SplitTextAnimation from "@/main/utils/SplitTextAnimation";
import { initScroll } from "@/main/utils/initScroll";
import { CUSTOM_EASE } from "@/offscreen/lib/customEases";

gsap.registerPlugin(ScrollTrigger);

const awards = [
  [
    "Awwwards",
    "11",
    "6 Site of the Day, 4 Developer awards, 1 Site of the Year nomination",
  ],
  ["FWA", "8", "5 of the Day, 2 Site of the Year nominations, 1 of the Month"],
  ["CSSDA", "6", "3 Site of the Month, 3 Site of the Day"],
  ["GSAP", "2", "1 Site of the Month, 1 Site of the Year nomination"],
];

export default class AboutPage {
  constructor(api) {
    this.api = api;
    this.splits = [];
    this.triggers = [];
    this.rules = [];
    this.destroyed = false;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.element = document.createElement("main");
    this.element.className = "about-page";
    this.element.id = "about";
    this.element.innerHTML = `
      <section class="about-hero" aria-labelledby="about-title">
        <div class="about-intro">
          <h1 id="about-title" class="about-title" data-reveal>I’m Fabian Tjoe-A-On –<br>creative and technical direction, creative coder by heart with a love for audio</h1>
          <p class="about-description" data-reveal><span class="description-label">Description</span>Ten years building interactive web experiences for clients big and small, including Google, Louis Vuitton, Spotify, Coca-Cola and Heineken. I work across the full front end, from real-time 3D, shaders and custom render pipelines to the component systems and accessibility that hold an experience together. I care about motion and visuals that feel considered, and interfaces other developers can actually extend.</p>
        </div>
      </section>
      <div class="about-details">
        <section class="about-section" aria-labelledby="awards-label">
          <div class="section-rule" aria-hidden="true"></div>
          <h2 class="section-label" id="awards-label" data-reveal>Awards & recognition</h2>
          <div class="awards-grid">
            ${awards
              .map(
                ([name, count, description]) => `
              <article class="award">
                <h3 class="award-title" data-reveal>${name} <span class="award-count">×${count}</span></h3>
                <p class="award-description" data-reveal>${description}</p>
              </article>`,
              )
              .join("")}
          </div>
        </section>
        <section class="about-section" aria-labelledby="clients-label">
          <div class="section-rule" aria-hidden="true"></div>
          <h2 class="section-label" id="clients-label" data-reveal>Selected clients</h2>
          <p class="section-copy" data-reveal>Spotify, LVMH, Google, Coca-Cola, Audemars Piguet, Christian Dior, The Wall Street Journal</p>
        </section>
        <section class="about-section" aria-labelledby="agencies-label">
          <div class="section-rule" aria-hidden="true"></div>
          <h2 class="section-label" id="agencies-label" data-reveal>Agencies I've worked for and collaborated with</h2>
          <p class="section-copy" data-reveal>Active Theory, Unit9, Cyphr, Addition, Synchronized</p>
        </section>
        <footer class="about-footer">
          <div class="section-rule" aria-hidden="true"></div>
          <p data-reveal>Fabian Tjoe-A-On<br>Creative developer</p>
          <button class="back-top" type="button" data-reveal>Back to top <span aria-hidden="true">↑</span></button>
        </footer>
      </div>`;
    document.body.classList.add("is-about");
    document.querySelector("#app").appendChild(this.element);
    this.scroll = initScroll(api);
    this.element.querySelector(".back-top").addEventListener("click", () => {
      this.scroll.lenis.scrollTo(0, { immediate: this.reducedMotion });
    });
    this.ready = this.initAnimations();
  }

  async initAnimations() {
    await document.fonts.ready;
    if (this.destroyed || this.leaving) return;
    this.element.querySelectorAll("[data-reveal]").forEach((element) => {
      const split = new SplitTextAnimation(element);
      this.splits.push(split);
      if (element.closest(".about-hero")) {
        split.in({ delay: element.tagName === "H1" ? 0.1 : 0.24 });
      } else {
        this.triggers.push(
          ScrollTrigger.create({
            trigger: element,
            start: "top 92%",
            once: true,
            onEnter: () => split.in(),
          }),
        );
      }
    });
    this.element.querySelectorAll(".section-rule").forEach((element) => {
      const tween = gsap.fromTo(
        element,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: this.reducedMotion ? 0 : 1.4,
          ease: CUSTOM_EASE,
          scrollTrigger: { trigger: element, start: "top 94%", once: true },
        },
      );
      this.rules.push(tween);
    });
    this.scroll.lenis.resize();
    ScrollTrigger.refresh();
  }

  async out() {
    this.leaving = true;
    this.triggers.forEach((trigger) => trigger.kill());
    this.rules.forEach((tween) => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
    this.exitRules?.kill();
    this.exitRules = gsap.to(this.element.querySelectorAll(".section-rule"), {
      scaleX: 0,
      duration: this.reducedMotion ? 0 : 0.45,
      ease: CUSTOM_EASE,
      overwrite: true,
    });
    this.scroll.lenis.stop();
    await Promise.all(
      this.splits.filter((split) => split.visible).map((split) => split.out()),
    );
  }

  destroy() {
    this.destroyed = true;
    this.triggers.forEach((trigger) => trigger.kill());
    this.rules.forEach((tween) => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
    this.exitRules?.kill();
    this.splits.forEach((split) => split.destroy());
    this.scroll.destroy();
    this.element.remove();
    document.body.classList.remove("is-about");
  }
}
