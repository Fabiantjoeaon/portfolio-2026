import { gsap } from "gsap";
import { CUSTOM_EASE } from "@/offscreen/lib/customEases";
import SplitTextAnimation from "@/main/utils/SplitTextAnimation";
import { formatMonoLabels } from "@/main/utils/monoLabels";

export function initNavigation(navigate, dispatcher) {
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <nav class="site-nav" aria-label="Main navigation">
      <a class="site-home-link" href="/" aria-label="Fabian Tjoe-A-On — Home">
        <span class="site-identity">Fabian Tjoe-A-On</span>
        <span class="site-role"><span data-mono>Creative developer</span></span>
      </a>
      <a class="site-about-link" href="/about"><span>About</span></a>
    </nav>
    <aside class="availability" aria-label="Availability">
      <div class="availability-status">
        <i class="availability-dot" aria-hidden="true"><span class="availability-halo"></span></i>
        <i class="availability-line" aria-hidden="true"></i>
        <span>Available for work</span>
      </div>
      <a href="mailto:fabiantjoeaon@gmail.com" data-mono>fabiantjoeaon@gmail.com</a>
    </aside>`;
  formatMonoLabels(header);
  document.body.appendChild(header);
  header.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (
      !link ||
      link.protocol !== window.location.protocol ||
      link.host !== window.location.host ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    navigate(link.getAttribute("href"));
  });
  const aboutLink = header.querySelector(".site-about-link");
  const label = aboutLink.querySelector("span");
  const availability = header.querySelector(".availability");
  const email = availability.querySelector("a");
  // Align the visible bracket, accounting for the mono font's side bearing.
  document.fonts.ready.then(() => {
    const context = document.createElement("canvas").getContext("2d");
    context.font = `100px ${getComputedStyle(email).fontFamily}`;
    email.style.setProperty("--bracket-bearing", `${-context.measureText("[").actualBoundingBoxLeft / 100}em`);
  });
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let labelSplit;
  let labelRevision = 0;
  let labelTarget = label.textContent;
  let revealed = false;
  const transitionLabel = async (text) => {
    if (text === labelTarget) return;
    labelTarget = text;
    const revision = ++labelRevision;
    labelSplit?.destroy();
    labelSplit = null;
    if (revealed && !reducedMotion) {
      labelSplit = new SplitTextAnimation(label);
      await labelSplit.in({ immediate: true });
      if (revision !== labelRevision) return;
      await labelSplit.out({ duration: 0.28 });
      if (revision !== labelRevision) return;
      labelSplit.destroy();
    }
    label.textContent = text;
    labelSplit = new SplitTextAnimation(label);
    await labelSplit.in({ duration: 0.7, immediate: !revealed });
    if (revision !== labelRevision) return;
    labelSplit.destroy();
    labelSplit = null;
  };
  const updateRule = (visible, origin) => {
    gsap.set(aboutLink, { "--nav-line-origin": origin });
    return gsap.to(aboutLink, {
      "--nav-line-scale": visible ? 1 : 0,
      duration: reducedMotion ? 0 : visible ? 0.65 : 0.5,
      ease: CUSTOM_EASE,
      overwrite: true,
    });
  };
  aboutLink.addEventListener("pointerenter", () => updateRule(true, "left"));
  aboutLink.addEventListener("pointerleave", () => updateRule(false, "right"));
  const sync = () => {
    const isAbout = /^\/about\/?$/.test(window.location.pathname);
    const isHome = window.location.pathname === "/";
    if (!isAbout) transitionLabel("About");
    aboutLink.href = isAbout ? "/" : "/about";
    aboutLink.setAttribute("aria-label", isAbout ? "Back to home" : "About");
    availability.setAttribute("aria-hidden", String(!isHome));
    availability.inert = !isHome;
    gsap.to(availability, {
      autoAlpha: isHome ? 1 : 0,
      y: isHome ? 0 : 12,
      duration: reducedMotion ? 0 : 0.7,
      ease: CUSTOM_EASE,
      overwrite: true,
    });
    updateRule(false, "right");
  };
  dispatcher.on("routeChanged", sync);
  dispatcher.on("aboutOpened", () => {
    if (/^\/about\/?$/.test(window.location.pathname)) transitionLabel("Back");
  });
  sync();
  if (!reducedMotion) {
    gsap
      .timeline({ repeat: -1, repeatDelay: 0.8, defaults: { ease: CUSTOM_EASE } })
      .fromTo(availability.querySelector(".availability-halo"),
        { scale: 1, opacity: 0.45 },
        { scale: 2.6, opacity: 0, duration: 2.2 }, 0)
      .to(availability.querySelector(".availability-dot"), {
        boxShadow: "0 0 12px rgba(0, 255, 82, 0.3)", duration: 0.8,
      }, 0)
      .to(availability.querySelector(".availability-dot"), {
        boxShadow: "0 0 4px rgba(0, 255, 82, 0.08)", duration: 1.4,
      }, 0.8);
  }
  dispatcher.on("compileEnd", async () => {
    if (revealed) return;
    revealed = true;
    await document.fonts.ready;
    if (!labelSplit) {
      const split = new SplitTextAnimation(label);
      labelSplit = split;
      split.in({ delay: 0.25, duration: 0.6 }).then(() => {
        if (labelSplit !== split) return;
        split.destroy();
        labelSplit = null;
      });
    }
    for (const element of header.querySelectorAll(
      ".site-identity, .site-role > span",
    )) {
      const split = new SplitTextAnimation(element);
      split.in({ delay: 0.25 }).then(() => split.destroy());
    }
  });
}
