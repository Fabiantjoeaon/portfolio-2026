import { gsap } from "gsap";
import { CUSTOM_EASE } from "@/offscreen/lib/customEases";
import SplitTextAnimation from "@/main/utils/SplitTextAnimation";

export function initNavigation(navigate, dispatcher) {
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <nav class="site-nav" aria-label="Main navigation">
      <a class="site-home-link" href="/" aria-label="Fabian Tjoe-A-On — Home">
        <span class="site-identity">Fabian Tjoe-A-On</span>
        <span class="site-role"><span>Creative developer</span></span>
      </a>
      <a class="site-about-link" href="/about"><span>About</span><i class="nav-rule" aria-hidden="true"></i></a>
    </nav>`;
  document.body.appendChild(header);
  header.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigate(link.getAttribute("href"));
  });
  const aboutLink = header.querySelector(".site-about-link");
  const rule = aboutLink.querySelector(".nav-rule");
  const updateRule = (hovered = false) => gsap.to(rule, {
    scaleX: hovered || window.location.pathname === "/about" ? 1 : 0,
    duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.6,
    ease: CUSTOM_EASE,
    overwrite: true,
  });
  aboutLink.addEventListener("pointerenter", () => updateRule(true));
  aboutLink.addEventListener("pointerleave", () => updateRule());
  const sync = () => {
    if (/^\/about\/?$/.test(window.location.pathname)) aboutLink.setAttribute("aria-current", "page");
    else aboutLink.removeAttribute("aria-current");
    updateRule();
  };
  dispatcher.on("routeChanged", sync);
  sync();
  let revealed = false;
  dispatcher.on("compileEnd", async () => {
    if (revealed) return;
    revealed = true;
    await document.fonts.ready;
    for (const element of header.querySelectorAll(".site-identity, .site-role > span, .site-about-link > span")) {
      const split = new SplitTextAnimation(element);
      split.in({ delay: 0.25 }).then(() => split.destroy());
    }
  });
}
