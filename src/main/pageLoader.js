import { gsap } from "gsap";
import "@/offscreen/lib/customEases";
import { timings } from "@/shared/timings";
import MonoShuffleAnimation from "@/main/utils/MonoShuffleAnimation";
import { formatMonoLabel } from "@/main/utils/monoLabels";
import "./styles/pageLoader.css";

/** Page content is still being prepared before a transition may start. */
export function initPageLoader(dispatcher) {
  const root = document.createElement("div");
  root.className = "page-loader";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
    <span class="page-loader-spinner" aria-hidden="true">
      <span class="page-loader-frame"><i></i><i></i><i></i><i></i></span>
      <span class="page-loader-plus"></span>
    </span>
    <span class="page-loader-label" data-mono>${formatMonoLabel("Loading")}</span>`;
  document.body.appendChild(root);

  const t = timings.pageLoader;
  const frame = root.querySelector(".page-loader-frame");
  const plus = root.querySelector(".page-loader-plus");
  const label = new MonoShuffleAnimation(root.querySelector(".page-loader-label"));
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const spin = gsap.timeline({ paused: true, repeat: -1 })
    .to(frame, { rotation: "+=90", duration: t.spinDuration * 0.5, ease: t.spinEase })
    .to(plus, { rotation: "+=45", duration: t.spinDuration * 0.5, ease: t.spinEase }, 0)
    .to({}, { duration: t.spinDuration * 0.5 });
  label.reset();
  let shownAt = 0;
  let visible = false;
  let hideCall = null;

  const show = () => {
    hideCall?.kill();
    hideCall = null;
    if (visible) return;
    visible = true;
    shownAt = performance.now();
    if (!reducedMotion) spin.play();
    label.in();
    gsap.fromTo(root, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: t.inDuration, ease: t.inEase, overwrite: true });
  };

  const hide = () => {
    visible = false;
    label.out();
    gsap.to(root, {
      autoAlpha: 0, y: -8, duration: t.outDuration, ease: t.outEase, overwrite: true,
      onComplete: () => spin.pause(),
    });
  };

  dispatcher.on("pageLoading", ({ loading }) => {
    if (loading) return show();
    if (!visible || hideCall) return;
    const wait = Math.max(0, t.minDuration - (performance.now() - shownAt) / 1000);
    hideCall = gsap.delayedCall(wait, () => { hideCall = null; hide(); });
  });
}
