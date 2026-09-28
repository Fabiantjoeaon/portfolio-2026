import Stats from "three/addons/libs/stats.module.js";
import { bindFpsTick, FPS_MESSAGE } from "@/shared/fps";

export function initFpsStats(worker) {
  const stats = new Stats();
  stats.showPanel(0);
  stats.dom.style.zIndex = "10001";
  document.body.appendChild(stats.dom);

  const tick = () => stats.update();

  if (worker) {
    worker.addEventListener("message", (event) => {
      if (event.data === FPS_MESSAGE) tick();
    });
    return;
  }

  bindFpsTick(tick);
}
