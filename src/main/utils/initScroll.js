import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CUSTOM_EASE } from "@/offscreen/lib/customEases";

gsap.registerPlugin(ScrollTrigger);

/** One scroll owner per mounted page, including its ticker and worker bridge. */
export function initScroll(api) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lenis = new Lenis({
    smoothWheel: !reducedMotion,
    duration: 1.2,
    lerp: 0,
    easing: CUSTOM_EASE,
  });
  const update = () => {
    ScrollTrigger.update();
    api.trigger({ name: "aboutScroll" }, { scroll: lenis.scroll });
  };
  const tick = (time) => lenis.raf(time * 1000);
  lenis.on("scroll", update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  lenis.scrollTo(0, { immediate: true });
  update();

  return {
    lenis,
    destroy() {
      gsap.ticker.remove(tick);
      lenis.off("scroll", update);
      lenis.destroy();
      window.scrollTo(0, 0);
      // Keep the outgoing scene at its last offset during the GPU transition.
      // Site resets it once that transition has finished.
    },
  };
}
