import { isMobileOrTablet } from "@/shared/devices";
import { gsap } from "gsap";
import { initLoader as initLegacyLoader } from "./legacyLoader";
import LoaderGrid from "./loaderGrid";
import MonoShuffleAnimation from "@/main/utils/MonoShuffleAnimation";
import { formatMonoLabel, formatMonoLabels } from "@/main/utils/monoLabels";
import { mainTimings as timings, selectMainTransitionTiming } from "@/shared/timings";
import "@/offscreen/lib/customEases";
import "./styles/loader.css";

const DIGIT = `<span class="loader-digit"><span class="loader-digit-roll"><span class="loader-digit-strip">${"01234567890"
  .split("")
  .map((value) => `<span>${value}</span>`)
  .join("")}</span></span></span>`;

export function initLoader(dispatcher, { skipLoader = false } = {}) {
  if (skipLoader) {
    initLegacyLoader(dispatcher);
    return { connect() {} };
  }
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = isMobileOrTablet() || matchMedia("(pointer: coarse)").matches;
  const t = timings.loader;
  const dom = document.createElement("div");
  dom.id = "loader-overlay";
  dom.className = "entry-loader";
  dom.setAttribute("aria-label", "Loading portfolio");
  dom.innerHTML = `<canvas class="loader-grid" aria-hidden="true"></canvas>
  <div class="loader-identity">
    <div class="loader-mask"><span class="site-identity">Fabian Tjoe-A-On</span></div>
    <span class="site-role"><span data-mono>Creative developer</span></span>
  </div>
  <div class="loader-count" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
    <span class="loader-digits" aria-hidden="true">${DIGIT.repeat(3)}</span>
  </div>
  <div class="loader-entry" hidden>
    <p class="loader-description">
      <span class="loader-mask"><span>Every visit</span></span>
      <span class="loader-mask"><span>sounds a little different.</span></span>
    </p>
    <div class="loader-choices">
      <button class="loader-enter" data-sound="true" type="button" aria-label="Enter with sound" data-mono disabled>Enter with sound</button>
      <button class="loader-enter" data-sound="false" type="button" aria-label="Enter without sound" data-mono disabled>Enter without sound</button>
    </div>
  </div>
  ${touch ? '<p class="loader-desktop-note"><span class="loader-mask"><span>Best viewed on desktop</span></span></p>' : ""}
  <div class="loader-status">
    <span data-mono>Loading assets</span>
    <i class="loader-track" aria-hidden="true"><i class="loader-fill"></i><i class="loader-sweep"></i></i>
  </div>`;
  formatMonoLabels(dom);
  document.body.classList.add("is-loading");
  document.body.appendChild(dom);
  const app = document.querySelector("#app");
  if (app) app.inert = true;

  const duration = (value) => (reducedMotion ? 0 : value);
  const stagger = (value) => (reducedMotion ? 0 : value);
  const grid = new LoaderGrid(dom.querySelector(".loader-grid"), {
    reducedMotion,
  });
  const counter = dom.querySelector(".loader-count");
  const rolls = dom.querySelectorAll(".loader-digit-roll");
  const digits = [...dom.querySelectorAll(".loader-digit-strip")].map(
    (strip, index, all) => {
      const place = all.length - 1 - index;
      const state = { value: 0 };
      const count = strip.children.length;
      return {
        place,
        to: gsap.quickTo(state, "value", {
          duration: duration(t.digitDuration + place * t.digitStep),
          ease: t.inEase,
          onUpdate: () => {
            strip.style.transform = `translateY(${(-(state.value % 10) / count) * 100}%)`;
          },
        }),
      };
    },
  );
  const fill = dom.querySelector(".loader-fill");
  const track = dom.querySelector(".loader-track");
  const sweepBar = dom.querySelector(".loader-sweep");
  sweepBar.style.width = `${t.sweepWidth * 100}%`;
  sweepBar.hidden = reducedMotion;
  const sweep = reducedMotion ? null : gsap.fromTo(
    sweepBar,
    { xPercent: -100 },
    {
      xPercent: 100 / t.sweepWidth,
      duration: t.sweepDuration,
      repeatDelay: t.sweepDelay,
      repeat: -1,
      ease: t.sweepEase,
    },
  );
  const entry = dom.querySelector(".loader-entry");
  const buttons = [...dom.querySelectorAll("button")];
  const lines = dom.querySelectorAll(".loader-description .loader-mask > span");
  const chromeLines = dom.querySelectorAll(
    ".loader-identity .loader-mask > span, .loader-desktop-note .loader-mask > span",
  );
  const monos = [...dom.querySelectorAll("[data-mono]")].map(
    (element) => new MonoShuffleAnimation(element),
  );
  const entryMonos = monos.filter((shuffle) => entry.contains(shuffle.element));
  const chromeMonos = monos.filter((shuffle) => !entryMonos.includes(shuffle));
  const status = monos.find((shuffle) =>
    shuffle.element.closest(".loader-status"),
  );
  monos.forEach((shuffle) => shuffle.reset());

  let api,
    unlockMedia,
    compiled = false,
    completing = false,
    entering = false;
  let target = 0,
    shown = 0,
    lastNumber = -1,
    lastTime = performance.now(),
    stage = "assets";
  const incoming = Promise.all([
    gsap.fromTo(
      [...chromeLines, ...rolls],
      { yPercent: 110 },
      {
        yPercent: 0,
        duration: duration(t.introDuration),
        stagger: stagger(t.introStagger),
        ease: t.inEase,
      },
    ),
    gsap.fromTo(
      track,
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: duration(t.introDuration),
        delay: duration(0.2),
        ease: t.inEase,
      },
    ),
    ...chromeMonos.map((shuffle, index) =>
      shuffle.in({ delay: duration(0.2 + index * 0.1) }),
    ),
  ]);

  const setCount = (value) => {
    counter.setAttribute("aria-valuenow", String(value));
    fill.style.transform = `scaleX(${value / 100})`;
    grid.fill(value / 100);
    for (const digit of digits) digit.to(Math.floor(value / 10 ** digit.place));
  };
  const setStage = (next, text) => {
    if (stage === next) return;
    stage = next;
    status.to(formatMonoLabel(text));
  };
  const progress = async (data) => {
    const value = Number(await data.progress);
    if (Number.isFinite(value))
      target = Math.max(target, Math.min(95, value * 0.95));
  };
  const compileProgress = async (data) => {
    const value = Number(await data.progress);
    if (Number.isFinite(value) && !compiled)
      target = Math.max(target, 95 + Math.min(1, value) * 4.5);
  };
  const complete = async () => {
    if (completing || !compiled || !api || shown < 99.95) return;
    completing = true;
    setCount(100);
    setStage("ready", "Ready");
    await incoming;
    grid.ripple(window.innerWidth / 2, window.innerHeight / 2, {
      strength: 0.55,
    });
    await gsap.to(rolls, {
      yPercent: -115,
      duration: duration(t.counterOut),
      delay: duration(t.digitDuration + 2 * t.digitStep),
      stagger: stagger(t.counterStagger),
      ease: t.counterEase,
    });
    counter.hidden = true;
    entry.hidden = false;
    buttons.forEach((button) => {
      button.disabled = false;
    });
    entryMonos.forEach((shuffle, index) =>
      shuffle.in({ delay: duration(0.35 + index * t.entryStagger) }),
    );
    await gsap.fromTo(
      lines,
      { yPercent: 115 },
      {
        yPercent: 0,
        duration: duration(t.entryIn),
        stagger: stagger(t.entryStagger),
        ease: t.inEase,
      },
    );
  };
  const tick = () => {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    grid.update(dt);
    if (completing) return;
    shown += (target - shown) * (1 - Math.exp(-dt * 5));
    const value = Math.floor(shown);
    if (value !== lastNumber) {
      lastNumber = value;
      setCount(value);
      if (value >= 94 && !compiled) setStage("shaders", "Compiling shaders");
    }
    complete();
  };
  const ready = () => {
    compiled = true;
    target = 100;
  };
  dispatcher.on("loadProgress", progress);
  dispatcher.on("compileProgress", compileProgress);
  dispatcher.on("compileEnd", ready);
  dom.addEventListener("pointermove", (event) =>
    grid.pointer(event.clientX, event.clientY),
  );
  gsap.ticker.add(tick);
  buttons.forEach((button) => {
    const shuffle = entryMonos.find((item) => item.element === button);
    button.addEventListener("pointerenter", () => {
      if (!button.disabled) shuffle.to(shuffle.target, { duration: 0.45 });
    });
    button.addEventListener("click", async (event) => {
      if (entering || button.disabled) return;
      entering = true;
      selectMainTransitionTiming("loader", window.location.pathname.startsWith("/project/") ? "project" : window.location.pathname.startsWith("/about") ? "about" : "home");
      buttons.forEach((choice) => {
        choice.disabled = true;
      });
      // Keep these calls inside the trusted gesture, before any await.
      window.audio?.setMuted(button.dataset.sound !== "true");
      window.audio?.start().catch(console.warn);
      unlockMedia?.();
      grid.ripple(
        event.clientX || window.innerWidth / 2,
        event.clientY || window.innerHeight / 2,
      );
      monos.forEach((item) =>
        item.out({ delay: duration(item === shuffle ? 0.2 : 0) }),
      );
      await Promise.all([
        gsap.to([...lines, ...chromeLines], {
          yPercent: -115,
          duration: duration(t.exitDuration),
          stagger: stagger(t.exitStagger),
          ease: t.outEase,
        }),
        gsap.to(track, {
          scaleX: 0,
          transformOrigin: "right center",
          duration: duration(t.exitDuration),
          ease: t.outEase,
        }),
      ]);
      dom.style.pointerEvents = "none";
      dispatcher.off("loadProgress", progress);
      dispatcher.off("compileProgress", compileProgress);
      dispatcher.off("compileEnd", ready);
      if (app) app.inert = false;
      await gsap.to(dom, {
        autoAlpha: 0,
        duration: duration(t.fadeDuration),
        ease: t.outEase,
      });
      gsap.ticker.remove(tick);
      sweep?.kill();
      grid.destroy();
      dom.remove();
      // Start the black hold only after the loader has finished fading.
      api.trigger({ name: "enterSite" }, { immediate: reducedMotion });
      gsap.delayedCall(duration(timings.startup.revealDelay + t.uiDelay), () => {
        document.body.classList.remove("is-loading");
        dispatcher.trigger({ name: "siteEntered", fireAtStart: true });
      });
    });
  });
  return {
    connect(nextApi, unlock) {
      api = nextApi;
      unlockMedia = unlock;
    },
  };
}
