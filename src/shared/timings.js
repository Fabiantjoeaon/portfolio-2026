// Add built-in GSAP eases here by name. Add custom eases with a CustomEase
// curve. This one list feeds registration and every easing dropdown.
export const easingDefinitions = [
  { name: "linear" },
  { name: "power1.in" },
  { name: "power1.out" },
  { name: "power1.inOut" },
  { name: "power2.in" },
  { name: "power2.out" },
  { name: "power2.inOut" },
  { name: "power3.in" },
  { name: "power3.out" },
  { name: "power3.inOut" },
  { name: "power4.in" },
  { name: "power4.out" },
  { name: "power4.inOut" },
  { name: "expo.in" },
  { name: "expo.out" },
  { name: "expo.inOut" },
  { name: "sine.in" },
  { name: "sine.out" },
  { name: "sine.inOut" },
  { name: "customEase1", curve: ".25, .46, .45, .94" },
  { name: "customEase2", curve: ".19, 1, .22, 1" },
  { name: "customEase3", curve: ".77, 0, .175, 1" },
  { name: "customEase4", curve: ".22, 1, .36, 1" },
  { name: "customEase5", curve: ".215, 1.61, .355, 1" },
  { name: "pageEase", curve: ".42, 0, .22, 1" },
];

export const easingOptions = Object.fromEntries(
  easingDefinitions.map(({ name }) => [name, name]),
);

// Page choreography. Durations/delays are seconds; lerps are amounts at 60fps.
// Every leaf is exposed in the dedicated Animation timings debug window.
// Visual amounts/colors remain in params.js.
export const timings = {
  homeReturn: {
    contentOut: 0.8,
    contentEase: "pageEase",
    wipeDuration: 1.65,
    wipeEase: "pageEase",
    screenDelay: 0.45,
    screenDuration: 1.1,
    screenEase: "pageEase",
    // Relative to the screen's start, not the wipe's start.
    tilesDelay: 0.25,
    tilesDuration: 1.5,
    tilesEase: "pageEase",
  },
  pages: {
    pageScreenDelay: 0.55,
    pageScreenDuration: 1.55,
    pageWipeDelay: 1.05,
    aboutWipeDuration: 2.4,
    projectWipeDuration: 2.65,
    projectScreenAt: 0.58,
    aboutRevealAt: 0.32,
    projectDomAt: 0.35,
    directDuration: 1.4,
    ease: "pageEase",
    screenEase: "pageEase",
  },
  tiles: { duration: 1.65, stagger: 0.5, ease: "pageEase", previewHold: 0.35 },
  gridLabels: {
    inDuration: 1.4,
    stagger: 0.55,
    hintDuration: 0.8,
    hintEase: "customEase4",
  },
  gallery: {
    galleryInputLerp: 0.395,
    gallerySnapLerp: 0.08,
    galleryShaderLerp: 0.035,
    galleryInDuration: 1.2,
    galleryNeighborDelay: 0.1,
    galleryNeighborStagger: 0.18,
    galleryOutDuration: 0.75,
    galleryStagger: 0.07,
    galleryWheelIdle: 0.24,
    ease: "pageEase",
  },
  about: {
    wallIn: 1.4,
    portraitIn: 1.65,
    portraitDelay: 0.12,
    ease: "pageEase",
  },
  text: {
    inDuration: 1.15,
    outDuration: 0.45,
    inStagger: 0.065,
    outStagger: 0.025,
    ease: "customEase4",
    projectIn: 1.45,
    projectDelay: 0.08,
    projectElementStagger: 0.055,
    aboutIn: 1.5,
    aboutTitleDelay: 0.12,
    aboutBodyDelay: 0.28,
    heroLineStagger: 0.085,
    heroEase: "pageEase",
    exitDuration: 0.65,
    exitStagger: 0.035,
    exitFade: 0.7,
    exitEase: "pageEase",
    paginationDelay: 0.32,
    paginationDuration: 1.3,
    projectRuleIn: 1.3,
    aboutRuleIn: 1.4,
    ruleOut: 0.45,
    ruleEase: "customEase4",
  },
  mono: { inDuration: 0.9, outDuration: 0.5, delayResolve: 0.18, fps: 40 },
  navigation: {
    labelOut: 0.28,
    labelIn: 0.7,
    lineIn: 0.65,
    lineOut: 0.5,
    availability: 0.7,
    introDelay: 0.25,
    introDuration: 0.6,
    ease: "customEase4",
    pulsePause: 0.8,
    pulseHalo: 2.2,
    pulseIn: 0.8,
    pulseOut: 1.4,
  },
  hover: {
    inDuration: 1.3,
    outDuration: 0.8,
    ease: "customEase3",
    overlayEase: "customEase4",
    pageOverlayFactor: 0.8,
  },
  scroll: { duration: 1.2, ease: "customEase4" },
  cube: {
    liftLerp: 0.08,
    flowLerp: 0.1,
  },
  world: {
    idle: 5,
    duration: 8.35,
    outgoingInteractionUntil: 0.35,
    interactionResumeAt: 0.2,
    interactionDelay: 0,
    ease: "customEase3",
  },
};

const timingListeners = new Set();

export function notifyTimingChange(group, key) {
  for (const listener of timingListeners)
    listener({ group, key, value: timings[group][key] });
}

export function onTimingChange(listener) {
  timingListeners.add(listener);
  return () => timingListeners.delete(listener);
}
