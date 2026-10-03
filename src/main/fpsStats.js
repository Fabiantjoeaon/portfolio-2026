import Stats from "three/addons/libs/stats.module.js";
import { bindFpsTick, FPS_MESSAGE } from "@/shared/fps";
import { getTier } from "@/shared/tiers";
import dispatcher from "@/shared/dispatcher";

export function initFpsStats(worker) {
  const stats = new Stats();
  stats.showPanel(0);
  stats.dom.style.zIndex = "10001";
  document.body.appendChild(stats.dom);

  const tier = document.createElement("div");
  tier.textContent = getTier();
  tier.style.cssText =
    "position:fixed;top:48px;left:0;z-index:10001;box-sizing:border-box;width:80px;padding:3px 0 2px;color:#0f0;background:#002;font:9px/1 ui-monospace,monospace;text-align:center;pointer-events:none;opacity:0.9";
  document.body.appendChild(tier);

  let lastDpr;
  dispatcher.on("renderDpr", ({ dpr }) => {
    if (dpr === lastDpr) return;
    lastDpr = dpr;
    tier.textContent = `${getTier()} · DPR ${dpr}`;
    console.log(`[fps] DPR ${dpr}`);
  });

  const tick = () => stats.update();

  if (worker) {
    worker.addEventListener("message", (event) => {
      if (event.data === FPS_MESSAGE) tick();
    });
    return;
  }

  bindFpsTick(tick);
}
