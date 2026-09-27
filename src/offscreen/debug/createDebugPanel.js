import GUI from "lil-gui";

const panels = [];

/** Floating panel, kept off the three.js inspector on the right. */
export function createDebugPanel(title) {
  const gui = new GUI({ title, width: 340 });
  const el = gui.domElement;
  el.style.left = "8px";
  el.style.right = "auto";
  el.style.zIndex = "1002";
  el.setAttribute("data-lenis-prevent", "");
  panels.push(gui);
  const shared = panels.length > 1;
  panels.forEach((panel, index) => {
    panel.domElement.style.maxHeight = shared ? "46vh" : "92vh";
    panel.domElement.style.top = shared && index > 0 ? "50vh" : "8px";
  });
  return gui;
}
