import { getFlag } from "@/offscreen/lib/query";

let probe = null;

// Touch browsers change innerHeight whenever their toolbars collapse or
// expand mid-scroll. Rendering and layout use the large viewport instead, so
// those gestures never resize render targets or reflow the page.
export function viewportHeight() {
  if (!getFlag("touchExperience") || !CSS.supports("height", "100lvh")) return window.innerHeight;
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none;";
    document.body.appendChild(probe);
  }
  return Math.max(window.innerHeight, Math.round(probe.getBoundingClientRect().height));
}
