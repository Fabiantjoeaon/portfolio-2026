import { gsap } from "gsap";
import "@/offscreen/lib/customEases";
import { timings } from "@/shared/timings";
import MonoShuffleAnimation from "@/main/utils/MonoShuffleAnimation";
import { formatMonoLabel } from "@/main/utils/monoLabels";
import { getFlag } from "@/offscreen/lib/query";

const number = (value) => String(value).padStart(2, "0");

const SOUND_HINTS = {
  ice: "click scene to generate sounds",
  meadow: "hover to generate sounds",
  cube: "hover to generate sounds",
};

export function soundHint(name, touch = getFlag("touchExperience")) {
  const hint = SOUND_HINTS[String(name ?? "").toLowerCase()] ?? "";
  return touch ? hint.replace(/^hover/, "drag") : hint;
}

/** Prev/next scene controls with a timer bar for the auto-cycle interval. */
export function initSceneSwitcher(api, dispatcher) {
  const root = document.createElement("nav");
  root.className = "scene-switcher";
  root.setAttribute("aria-label", "Scenes");
  root.innerHTML = `
    <span class="scene-switcher-name" data-mono></span>
    <div class="scene-switcher-row">
      <button class="scene-switcher-step" type="button" data-step="-1" aria-label="Previous scene">[ ← ]</button>
      <span class="scene-switcher-index" data-mono>01</span>
      <span class="scene-switcher-track" aria-hidden="true"><i class="scene-switcher-fill"></i></span>
      <span class="scene-switcher-total" data-mono>01</span>
      <button class="scene-switcher-step" type="button" data-step="1" aria-label="Next scene">[ → ]</button>
    </div>`;
  document.body.appendChild(root);

  const fill = root.querySelector(".scene-switcher-fill");
  const buttons = root.querySelectorAll("button");
  const nameShuffle = new MonoShuffleAnimation(root.querySelector(".scene-switcher-name"));
  const indexShuffle = new MonoShuffleAnimation(root.querySelector(".scene-switcher-index"));
  const total = root.querySelector(".scene-switcher-total");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = getFlag("touchExperience");
  let revealed = false;
  let shown = false;
  let timeline = null;
  let index = -1;
  let start = 0;

  const runFill = (from, to, ms) => {
    fill.style.transition = "none";
    fill.style.transform = `scaleX(${from})`;
    if (ms <= 0 || reducedMotion) {
      fill.style.transform = `scaleX(${reducedMotion ? from : to})`;
      return;
    }
    fill.getBoundingClientRect();
    fill.style.transition = `transform ${ms}ms linear`;
    fill.style.transform = `scaleX(${to})`;
  };

  const sync = () => {
    const visible = revealed && location.pathname === "/" &&
      (timeline?.state === "idle" || timeline?.state === "transition");
    if (visible === shown) return;
    shown = visible;
    root.inert = !visible;
    root.setAttribute("aria-hidden", String(!visible));
    gsap.to(root, {
      autoAlpha: visible ? 1 : 0,
      y: visible ? 0 : 12,
      duration: reducedMotion ? 0 : timings.navigation.availability,
      ease: timings.navigation.ease,
      overwrite: true,
    });
  };

  const cycling = (state) => state === "idle" || state === "transition";

  // Each scene gets a single fill, from when it appears until the next one
  // does; later messages only retime the rest of the same bar.
  dispatcher.on("sceneTimeline", (data) => {
    const { state, names, remaining, autoAdvance } = data;
    if (cycling(state)) {
      const now = performance.now();
      if (data.index !== index || !cycling(timeline?.state)) start = now;
      if (data.index !== index) {
        index = data.index;
        total.textContent = number(names.length);
        nameShuffle.to(formatMonoLabel(touch ? `scene${number(index + 1)}` : soundHint(names[index], false)));
        indexShuffle.to(number(index + 1));
      }
      const span = now + remaining - start;
      if (autoAdvance || state === "transition") runFill(span > 0 ? (now - start) / span : 1, 1, remaining);
      else runFill(0, 0, 0);
      for (const button of buttons) button.disabled = state !== "idle";
    }
    timeline = data;
    sync();
  });

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-step]");
    if (!button || button.disabled) return;
    api.trigger({ name: "sceneStep" }, { step: Number(button.dataset.step) });
  });

  dispatcher.on("routeChanged", sync);
  dispatcher.on(getFlag("skipLoader") ? "compileEnd" : "siteEntered", () => {
    revealed = true;
    sync();
  });
  root.inert = true;
  root.setAttribute("aria-hidden", "true");
}
