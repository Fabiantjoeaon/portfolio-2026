import { getFlag } from "@/offscreen/lib/query";

const probes = {};

const measure = (unit) => {
  if (!probes[unit]) {
    const probe = probes[unit] = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = `position:fixed;top:0;left:0;width:0;height:100${unit};visibility:hidden;pointer-events:none;`;
    document.body.appendChild(probe);
  }
  return Math.round(probes[unit].getBoundingClientRect().height);
};

const stableUnits = () => getFlag("touchExperience") && CSS.supports("height", "100lvh");

// Touch browsers change innerHeight whenever their toolbars collapse or
// expand mid-scroll. Rendering and layout use the large viewport instead, so
// those gestures never resize render targets or reflow the page.
export function viewportHeight() {
  if (!stableUnits()) return window.innerHeight;
  return Math.max(window.innerHeight, measure("lvh"));
}

// Height that stays visible with every browser toolbar expanded. Above-the-fold
// interface is laid out within it.
export function visibleViewportHeight() {
  if (!stableUnits()) return window.innerHeight;
  return Math.min(window.innerHeight, measure("svh"));
}
