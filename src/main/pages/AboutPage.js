import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import SplitTextAnimation from "@/main/utils/SplitTextAnimation";
import MonoShuffleAnimation from '@/main/utils/MonoShuffleAnimation';
import PageScroll from "@/main/utils/PageScroll";
import { formatMonoLabels } from '@/main/utils/monoLabels';
import { sectionHead, revealRules } from '@/main/utils/sections';
import "@/offscreen/lib/customEases";
import { timings } from "@/shared/timings";

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
const awardTotal = awards.reduce((sum, [, count]) => sum + Number(count), 0);
const clients = ["Spotify", "LVMH", "Google", "Coca-Cola", "Audemars Piguet", "Christian Dior", "The Wall Street Journal"];
const agencies = ["Active Theory", "Unit9", "Cyphr", "Addition", "Synchronized"];
const services = [
  ["Direction", ["Creative direction", "Technical direction"]],
  ["Development", ["Creative development", "Real-time 3D"]],
  ["Experiences", ["Interactive prototyping", "Audio-reactive experiences"]],
];
const number = value => String(value).padStart(2, "0");

export default class AboutPage {
  constructor(api) {
    this.api = api;
    this.splits = [];
    this.monos = [];
    this.triggers = [];
    this.destroyed = false;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.element = document.createElement("main");
    this.element.className = "about-page";
    this.element.style.visibility = "hidden";
    this.element.id = "about";
    this.element.innerHTML = `
      <section class="about-hero" aria-labelledby="about-title">
        <div class="about-intro">
          <h1 id="about-title" class="about-title" data-reveal>I’m Fabian Tjoe-A-On –<br>creative and technical direction, creative coder by heart with a love for audio</h1>
          <p class="about-description"><span class="description-label">Description</span><span data-reveal>Ten years building interactive web experiences for clients big and small, including Google, Louis Vuitton, Spotify, Coca-Cola and Heineken. I work across the full front end, from real-time 3D, shaders and custom render pipelines to the component systems and accessibility that hold an experience together. I care about motion and visuals that feel considered, and interfaces other developers can actually extend.</span></p>
        </div>
      </section>
      <div class="page-details about-details">
        <section class="page-section" aria-labelledby="awards-label">
          ${sectionHead({ id: 'awards-label', index: '01', label: 'Awards & recognition', detail: `${awards.length} platforms` })}
          <p class="award-total" aria-hidden="true"><span data-reveal>${awardTotal}</span><span data-mono>Awards & nominations</span></p>
          <ul class="index-table">
            ${awards.map(([name, count, description]) => `
              <li class="index-row">
                <h3 class="index-name" data-reveal>${name}</h3>
                <p class="index-body" data-reveal>${description}</p>
                <span class="index-aside" data-mono>×${count}</span>
              </li>`).join('')}
          </ul>
        </section>
        <div class="page-pair">
          ${[['clients-label', '02', 'Selected clients', clients], ['agencies-label', '03', 'Agencies & collaborators', agencies]].map(([id, index, label, names]) => `
            <section class="page-section" aria-labelledby="${id}">
              ${sectionHead({ id, index, label, detail: number(names.length) })}
              <ol class="name-list">${names.map((name, i) => `<li><span class="name-index" data-mono aria-hidden="true">${number(i + 1)}</span><span data-reveal>${name}</span></li>`).join('')}</ol>
            </section>`).join('')}
        </div>
        <section class="page-section" aria-labelledby="services-label">
          ${sectionHead({ id: 'services-label', index: '04', label: 'Services', detail: 'Disciplines' })}
          <ul class="index-table">
            ${services.map(([category, items], i) => `
              <li class="index-row">
                <h3 class="index-name" data-reveal>${category}</h3>
                <p class="index-body index-body-list" data-reveal>${items.join('<br>')}</p>
                <span class="index-aside" data-mono aria-hidden="true">${number(i + 1)}</span>
              </li>`).join('')}
          </ul>
        </section>
        <footer class="page-footer about-footer">
          <i class="section-rule" aria-hidden="true"></i>
          <p class="footer-wordmark" data-reveal>Fabian Tjoe-A-On</p>
          <div class="footer-bar">
            <span data-mono>Creative developer</span>
            <nav class="about-socials" aria-label="Social profiles">
              <!-- Placeholder profiles: replace before publishing. -->
              <a href="https://www.linkedin.com/in/your-profile/" target="_blank" rel="noopener noreferrer"><span data-mono>LinkedIn</span> ↗</a>
              <a href="https://x.com/your_handle" target="_blank" rel="noopener noreferrer"><span data-mono>Twitter / X</span> ↗</a>
              <a href="https://www.instagram.com/your_handle/" target="_blank" rel="noopener noreferrer"><span data-mono>Instagram</span> ↗</a>
            </nav>
            <button class="back-top" type="button"><span data-mono>Back to top</span> <span aria-hidden="true">↑</span></button>
          </div>
        </footer>
      </div>`;
    formatMonoLabels(this.element);
    document.querySelector("#app").appendChild(this.element);
    this.element.querySelector(".back-top").addEventListener("click", () => {
      this.scroll?.scrollTo(0, { immediate: this.reducedMotion });
    });
    this.prepared = this.prepare();
  }

  /** Split and hide every label ahead of the page transition; animations start in open(). */
  async prepare() {
    await document.fonts.ready;
    if (this.destroyed) return;
    for (const element of this.element.querySelectorAll('[data-mono]')) {
      const mono = new MonoShuffleAnimation(element);
      this.monos.push(mono);
      mono.reset();
    }
    for (const element of this.element.querySelectorAll("[data-reveal]")) {
      if (element.matches('[data-mono]')) continue;
      this.splits.push(new SplitTextAnimation(element, { fade: Boolean(element.closest('.about-hero')) }));
    }
  }

  open() {
    document.body.classList.add("is-about");
    this.scroll = new PageScroll(this.api);
    this.ready = this.prepared.then(() => this.initAnimations());
  }

  initAnimations() {
    if (this.destroyed || this.leaving) return;
    for (const mono of this.monos) {
      if (mono.element.closest('.about-hero')) {
        mono.in({ delay: timings.text.aboutBodyDelay });
      } else {
        this.triggers.push(ScrollTrigger.create({
          trigger: mono.element,
          start: mono.element.closest('.footer-bar') ? 'top bottom' : 'top 92%',
          once: true,
          onEnter: () => mono.in(),
        }));
      }
    }
    this.splits.forEach((split) => {
      const element = split.element;
      if (element.closest(".about-hero")) {
        split.in({ delay: element.tagName === "H1" ? timings.text.aboutTitleDelay : timings.text.aboutBodyDelay, duration: timings.text.aboutIn, stagger: timings.text.heroLineStagger, ease: timings.text.heroEase });
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
    this.triggers.push(...revealRules(this.element, this.reducedMotion));
    this.scroll.resize();
    this.element.style.visibility = "";
  }

  out() { return this.exitPromise ??= this.animateOut(); }

  async animateOut() {
    this.leaving = true;
    this.triggers.forEach((trigger) => trigger.kill());
    this.scroll?.stop();
    this.exitFade = gsap.to(this.element, {
      opacity: 0, duration: this.reducedMotion ? 0 : timings.text.exitFade,
      ease: timings.text.exitEase, overwrite: true,
    });
    await Promise.all([
      this.exitFade,
      ...this.monos.filter((mono) => mono.visible).map((mono) => mono.out()),
    ]);
  }

  destroy() {
    this.exitFade?.kill();
    this.destroyed = true;
    this.triggers.forEach((trigger) => trigger.kill());
    gsap.killTweensOf(this.element.querySelectorAll(".section-rule"));
    this.splits.forEach((split) => split.destroy());
    this.monos.forEach((mono) => mono.destroy());
    this.scroll?.destroy();
    this.element.remove();
    if (this.scroll) document.body.classList.remove("is-about");
  }
}
