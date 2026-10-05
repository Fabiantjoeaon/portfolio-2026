import { bindSoundCloudPlayback } from "@/main/utils/soundCloudPlayback";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import SplitTextAnimation from "@/main/utils/SplitTextAnimation";
import MonoShuffleAnimation from "@/main/utils/MonoShuffleAnimation";
import PageScroll from "@/main/utils/PageScroll";
import { formatMonoLabels } from "@/main/utils/monoLabels";
import {
  sectionHead,
  indexRows,
  bindIndexRowHovers,
  revealSections,
} from "@/main/utils/sections";
import "@/offscreen/lib/customEases";
import { mainTimings as timings } from "@/shared/timings";
import { mobileSettings } from "@/shared/mobileSettings";
import { socialsMarkup } from "@/main/socials";

gsap.registerPlugin(ScrollTrigger);

const awards = [
  [
    "Awwwards",
    "11",
    "6 Site of the Day, 3 Developer awards, 1 Site of the Year nomination",
  ],
  ["FWA", "8", "5 of the Day, 2 Site of the Year nominations, 1 of the Month"],
  ["CSSDA", "6", "3 Site of the Month, 3 Site of the Day"],
  ["GSAP", "2", "1 Site of the Month, 1 Site of the Year nomination"],
];
const awardTotal = awards.reduce((sum, [, count]) => sum + Number(count), 0);
const clients = [
  "Spotify",
  "LVMH",
  "Google",
  "Coca-Cola",
  "Audemars Piguet",
  "Christian Dior",
  "The Wall Street Journal",
];
const agencies = [
  "Active Theory",
  "Unit9",
  "Cyphr.io",
  "Addition",
  "Synchronized Studio",
  "Merlin Studio",
];
const services = [
  [
    "Development",
    [
      "Creative development",
      "WebGPU / WebGL and real-time 3D",
      "Full stack development",
    ],
  ],
  [
    "Direction",
    ["Creative direction", "Technical direction", "Audio direction"],
  ],
  [
    "Experiences",
    [
      "Interactive prototyping",
      "Audio-reactive experiences",
      "Audio engineering",
    ],
  ],
];
// Rows take { name, body, aside } plus either `soundcloud` (embedded player) or `url` (external link).
const music = {
  copy: "Outside of working on digital experiences, I love to play and make records. I always have unreleased music laying around, drop me message!",
  mixes: [
    {
      name: "Tierra Sónica 2nd May 2026",
      body: "Radio show — Operator Radio",
      aside: "2026",
      soundcloud:
        "https://soundcloud.com/operator-radio/tierra-so-nica-w-tjoe-a-on-2nd",
    },
    {
      name: "Bound45 Radio 11",
      body: "Radio show — Operator Radio",
      aside: "2023",
      soundcloud:
        "https://soundcloud.com/boundfortyfive/bound45-operator-radio-11-w",
    },
  ],
  tracks: [
    {
      name: "Chimaera",
      body: "Tanz Society Volume One",
      aside: "2026",
      url: "https://tanzform.bandcamp.com/album/tanz-society-volume-one",
    },
    {
      name: "Metaquine",
      body: "Kepler-129 presents: VSX002",
      aside: "2021",
      url: "https://visolux.bandcamp.com/track/metaquine-2",
    },
  ],
};
// Each credit reads as one sentence: "<name> — <body>.", with the name linking to `url`.
const credits = [
  {
    name: "smooothy",
    body: "Slider motion behind the project gallery, by Federico Valla",
    url: "https://github.com/vallafederico/smooothy",
  },
  {
    name: "VAT rendering",
    body: "Rose spawning and interaction inspired by this VAT demo by Ming Jyun Hung",
    url: "https://x.com/mingjyunhung/status/1995855482171654479",
  },
  {
    name: "Snow",
    body: "Snow rendering inspired by this shader by Gianluca Lomarco",
    url: "https://x.com/__rockbiter/status/1930303456662704147",
  },
  {
    name: "Avatar",
    body: "Holographic point cloud avatar inspired by Lusion's about page",
    url: "https://lusion.co/about",
  },
];
const number = (value) => String(value).padStart(2, "0");

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
        ${socialsMarkup("site-socials about-socials")}
        <div class="about-intro">
          <h1 id="about-title" class="about-title" data-reveal>I’m Fabian Tjoe-A-On.<br>Creative and technical direction, analog heart with exceptional digitalism. I build experiences for clients big and small.</h1>
          <p class="about-description"><span class="description-label">Description</span><span data-reveal>I shape digital experiences from first idea to final release: setting creative and technical direction, choosing the right approach and building it myself across the full stack. Real-time 3D and shaders are where I love to dig in, backed by component systems, infrastructure and accessibility that keep an experience solid. With an eye for detail, I think along with designers to elevate an idea and get the most out of it. <br><br>I care about motion and visuals that feel considered, and about interfaces other developers can extend. I'm just as drawn to what happens beyond the screen, in installations and physical space, and to sound. I love music and audio, most of all where the digital world and audio meet.</span></p>
        </div>
      </section>
      <div class="page-details about-details">
        <section class="page-section" aria-labelledby="awards-label">
          ${sectionHead({ id: "awards-label", index: "01", label: "Awards & recognition", detail: `${awards.length} platforms` })}
          <p class="award-total" aria-hidden="true"><span data-reveal>${awardTotal}</span><span data-mono>Awards & nominations</span></p>
          <ul class="index-table">
            ${awards
              .map(
                ([name, count, description]) => `
              <li class="index-row">
                <h3 class="index-name" data-reveal>${name}</h3>
                <p class="index-body" data-reveal>${description}</p>
                <span class="index-aside" data-mono>×${count}</span>
              </li>`,
              )
              .join("")}
          </ul>
        </section>
        <div class="page-pair">
          ${[
            ["clients-label", "02", "Selected clients", clients],
            ["agencies-label", "03", "Agencies & collaborators", agencies],
          ]
            .map(
              ([id, index, label, names]) => `
            <section class="page-section" aria-labelledby="${id}">
              ${sectionHead({ id, index, label, detail: number(names.length) })}
              <ol class="name-list">${names.map((name, i) => `<li><span class="name-index" data-mono aria-hidden="true">${number(i + 1)}</span><span data-reveal>${name}</span></li>`).join("")}</ol>
            </section>`,
            )
            .join("")}
        </div>
        <section class="page-section" aria-labelledby="services-label">
          ${sectionHead({ id: "services-label", index: "04", label: "Services", detail: "Disciplines" })}
          <ul class="index-table">
            ${services
              .map(
                ([category, items], i) => `
              <li class="index-row">
                <h3 class="index-name" data-reveal>${category}</h3>
                <p class="index-body index-body-list" data-reveal>${items.join("<br>")}</p>
                <span class="index-aside" data-mono aria-hidden="true">${number(i + 1)}</span>
              </li>`,
              )
              .join("")}
          </ul>
        </section>
        <section class="page-section" aria-labelledby="music-label">
          ${sectionHead({ id: "music-label", index: "05", label: "Music", detail: "Mixes & tracks" })}
          <p class="section-statement music-copy" data-reveal><span class="statement-indent" aria-hidden="true"></span>${music.copy}</p>
          <div class="music-groups">
          ${[
            ["music-mixes", "Mixes & DJ sets", music.mixes],
            ["music-tracks", "Tracks", music.tracks],
          ]
            .filter(([, , rows]) => rows.length)
            .map(
              ([id, label, rows]) => `
            <div class="music-group" role="group" aria-labelledby="${id}">
              <p class="music-group-head"><span id="${id}" data-mono aria-label="${label}">${label}</span><span data-mono aria-hidden="true">${number(rows.length)}</span></p>
              <ul class="index-table">${indexRows(rows)}</ul>
            </div>`,
            )
            .join("")}
          </div>
        </section>
        ${
          credits.length
            ? `<section class="page-section about-credits" aria-labelledby="credits-label">
          <h2 id="credits-label" class="about-credits-label" data-mono aria-label="Credits">Credits</h2>
          <div class="about-credits-list">${credits
            .map(
              ({ name, body, url }) =>
                `<p data-reveal><a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a> — ${body}.</p>`,
            )
            .join("")}</div>
        </section>`
            : ""
        }
        <footer class="page-footer about-footer">
          <i class="section-rule" aria-hidden="true"></i>
          <div class="footer-bar">
            <span data-mono>Creative technologist</span>
            <button class="back-top" type="button"><span data-mono>Back to top</span> <span aria-hidden="true">↑</span></button>
          </div>
        </footer>
      </div>`;
    this.element.style.setProperty(
      "--portrait-offset-y",
      mobileSettings.portrait.portraitY,
    );
    formatMonoLabels(this.element);
    document.querySelector("#app").appendChild(this.element);
    this.element.querySelector(".back-top").addEventListener("click", () => {
      this.scroll?.scrollTo(0, { immediate: this.reducedMotion });
    });
    this.disposeSoundCloud = bindSoundCloudPlayback(this.element);
    this.prepared = this.prepare();
  }

  /** Split and hide every label ahead of the page transition; animations start in open(). */
  async prepare() {
    await document.fonts.ready;
    if (this.destroyed) return;
    for (const element of this.element.querySelectorAll("[data-mono]")) {
      const mono = new MonoShuffleAnimation(element);
      this.monos.push(mono);
      mono.reset();
    }
    bindIndexRowHovers(this.element, this.monos);
    for (const element of this.element.querySelectorAll("[data-reveal]")) {
      if (element.matches("[data-mono]")) continue;
      this.splits.push(
        new SplitTextAnimation(element, {
          fade: Boolean(element.closest(".about-hero")),
        }),
      );
    }
  }

  open() {
    document.body.classList.add("is-about");
    this.scroll = new PageScroll(this.api, this.element);
    this.ready = this.prepared.then(() => this.initAnimations());
  }

  initAnimations() {
    if (this.destroyed || this.leaving) return;
    const scrollReveals = new Map();
    for (const mono of this.monos) {
      if (mono.element.closest(".about-hero"))
        mono.in({ delay: timings.text.aboutBodyDelay });
      else scrollReveals.set(mono.element, (delay) => mono.in({ delay }));
    }
    this.splits.forEach((split) => {
      const element = split.element;
      if (element.closest(".about-hero")) {
        split.in({
          delay:
            element.tagName === "H1"
              ? timings.text.aboutTitleDelay
              : timings.text.aboutBodyDelay,
          duration: timings.text.aboutIn,
          stagger: timings.text.heroLineStagger,
          ease: timings.text.heroEase,
        });
      } else {
        scrollReveals.set(element, (delay) => split.in({ delay }));
      }
    });
    this.triggers.push(
      ...revealSections(this.element, scrollReveals, this.reducedMotion),
    );
    this.scroll.resize();
    this.element.style.visibility = "";
  }

  out() {
    return (this.exitPromise ??= this.animateOut());
  }

  async animateOut() {
    this.leaving = true;
    this.triggers.forEach((trigger) => trigger.kill());
    this.scroll?.stop();
    this.exitFade = gsap.to(this.element, {
      opacity: 0,
      duration: this.reducedMotion ? 0 : timings.text.exitFade,
      ease: timings.text.exitEase,
      overwrite: true,
    });
    await Promise.all([
      this.exitFade,
      ...this.monos.filter((mono) => mono.visible).map((mono) => mono.out()),
    ]);
  }

  destroy() {
    this.exitFade?.kill();
    this.destroyed = true;
    this.disposeSoundCloud?.();
    this.triggers.forEach((trigger) => trigger.kill());
    gsap.killTweensOf(this.element.querySelectorAll(".section-rule"));
    this.splits.forEach((split) => split.destroy());
    this.monos.forEach((mono) => mono.destroy());
    this.scroll?.destroy();
    this.element.remove();
    if (this.scroll) document.body.classList.remove("is-about");
  }
}
