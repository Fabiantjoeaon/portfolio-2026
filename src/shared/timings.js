import savedTimings from "./timings.saved.json" with { type: "json" };

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
  { name: "softOut", curve: ".35, .8, .2, 1" },
  { name: "softInOut", curve: ".45, .05, .25, 1" },
];

export const easingOptions = Object.fromEntries(
  easingDefinitions.map(({ name }) => [name, name]),
);

// Page choreography. Durations/delays are seconds; lerps are amounts at 60fps.
// Route-owned values are grouped below in the ?debugAnimations panel.
// Visual amounts/colors remain in params.js.
const defaults = {
  startup: {
    revealDelay: 0,
    wipeDuration: 5,
    wipeEase: "customEase3",
    // Deep links into a page skip the world wipe and fade up from black.
    pageFade: 1.2,
    // Fraction of each intro animation (wipe, screen, tiles) at which it reads
    // as done; the intro hands over to home (interaction, tile clicks) here.
    visibleEnd: 0.7,
    // Fraction of the wipe and tile intro after which home is interactive; the
    // wipe and camera zoom finish underneath.
    interactiveAt: 0.4,
    // Camera starts zoomFrom times its distance out and eases in to rest.
    zoomFrom: 1.4,
    zoomDuration: 3.5,
    zoomEase: "pageEase",
    screenDelay: 0.9,
    screenDuration: 2,
    screenEase: "customEase4",
    // Screen-space iris from black over the world wipe, loader to home only.
    zoomWipeDuration: 2.6,
    zoomWipeEase: "pageEase",
  },
  loader: {
    introDuration: 1.3,
    introStagger: 0.09,
    digitDuration: 0.6,
    // Added per digit place, so tens and hundreds roll heavier than ones.
    digitStep: 0.35,
    counterOut: 1,
    counterStagger: 0.08,
    counterEase: "customEase3",
    entryIn: 1.3,
    entryStagger: 0.12,
    exitDuration: 0.9,
    exitStagger: 0.05,
    fadeDuration: 1.8,
    uiDelay: 1.4,
    // Fraction of the track covered by the travelling loading segment.
    sweepWidth: 0.4,
    sweepDuration: 1.5,
    sweepDelay: 0.15,
    sweepEase: "customEase3",
    inEase: "customEase4",
    outEase: "customEase3",
  },
  homeReturn: {
    backgroundLead: 0,
    contentOut: 0.8,
    contentEase: "pageEase",
    wipeDuration: 1.65,
    wipeEase: "pageEase",
    screenDelay: 0.45,
    screenDuration: 1.1,
    screenEase: "pageEase",
    // Fraction of the screen and tile reveal after which home is interactive
    // again; the reveal finishes underneath.
    interactiveAt: 0.3,
  },
  pages: {
    pageScreenDelay: 0.55,
    pageScreenDuration: 1.55,
    pageWipeDelay: 1.05,
    aboutWipeDuration: 2.4,
    projectWipeDuration: 2.65,
    projectScreenAt: 0.3,
    aboutRevealAt: 0.32,
    projectDomAt: 0.35,
    directDuration: 1.4,
    ease: "pageEase",
    screenEase: "pageEase",
  },
  pageLoader: {
    delay: 0.15,
    minDuration: 0.6,
    inDuration: 0.7,
    outDuration: 0.6,
    spinDuration: 1.4,
    inEase: "customEase4",
    outEase: "customEase3",
    spinEase: "customEase3",
  },
  tiles: {
    duration: 1.65, stagger: 0.5, outEase: "pageEase", inEase: "pageEase", previewHold: 0.35,
    // Reveal delays are relative to the screen's start.
    startupDelay: 0.5, startupDuration: 2.4, startupEase: "customEase4",
    returnDelay: 0.25, returnDuration: 1.5, returnEase: "customEase4",
  },
  gridLabels: {
    inDuration: 1.4,
    stagger: 0.55,
    hintDuration: 0.8,
    hintEase: "customEase4",
  },
  gallery: {
    galleryInDuration: 1.2,
    galleryNeighborDelay: 0.1,
    galleryNeighborStagger: 0.18,
    galleryOutDuration: 0.75,
    galleryWheelIdle: 0.24,
    // Card label: starts once its slide is the target, so it is leaving by the time the slider snaps.
    galleryLabelDelay: 0,
    galleryLabelIn: 0.35,
    galleryLabelHold: 0.3,
    gallerySwipeHold: 1,
    galleryLabelOut: 0.3,
    // Glass cards: the slab grows in behind each image once the gallery has taken over.
    glassRevealDelay: 0.1,
    glassRevealDuration: 1.1,
    glassRevealStagger: 0.12,
    // Fraction of the card entrance after which the page's gallery controls sequence in.
    galleryUiAt: 0.6,
    inEase: "pageEase",
    outEase: "pageEase",
    ease: "pageEase",
  },
  projectSky: {
    // Let the outgoing world clear to black before the vortex opens.
    revealAt: 0.65,
    inDuration: 2.1,
    outDuration: 1.9,
    inEase: "softInOut",
    outEase: "pageEase",
    // The gallery waits until the backdrop's in animation has run this long.
    galleryDelay: 0.25,
    // Fraction of the in animation after which the glitch pulse fires.
    pulseAt: 1,
    // Project to project: out, then straight back in with a glitch pulse.
    // Small lead for the content fade, then both leave together.
    switchOutDelay: 0.15,
    switchOutDuration: 1.2,
    switchOutEase: "customEase3",
    switchInDuration: 1.8,
    // The next project's content waits for most of the backdrop's in animation.
    switchGalleryDelay: 1.1,
    // Core glow blend to the project's `coreGlowColorScrolled` near "Next project".
    glowScrollDuration: 1.4,
  },
  // One continuous zoom across the home <-> page wipes: forwards into a
  // page, backwards to home. Each scene travels exp(zoomFactor) in scale.
  cameraZoom: {
    zoomFactor: 0.45,
    startAt: 0,
    endAt: 1,
    ease: "pageEase",
  },
  about: {
    wallIn: 1.4,
    wallEase: "pageEase",
    portraitIn: 3.4,
    portraitDelay: 0.12,
    // Linear avatar reveal progress at which the hero text starts.
    textRevealAt: 0.32,
    ease: "softInOut",
  },
  text: {
    inDuration: 1.15,
    outDuration: 0.45,
    inStagger: 0.065,
    outStagger: 0.025,
    ease: "customEase4",
    projectIn: 1.45,
    aboutIn: 1.6,
    aboutTitleDelay: 0.1,
    // Never before the title's last line has started.
    aboutBodyDelay: 0.4,
    heroLineStagger: 0.085,
    heroEase: "pageEase",
    exitFade: 0.7,
    exitEase: "pageEase",
  },
  // Project hero: title, gallery, credits and pagination enter one after
  // another along the top-left to bottom-right diagonal.
  contentReveal: { delay: 0.08, stagger: 0.055, duration: 1.45 },
  mono: { inDuration: 0.9, outDuration: 0.5, delayResolve: 0.18, fps: 40 },
  touchLabel: {
    nameIn: 0.6,
    nameOut: 0.32,
    nameInEase: "customEase2",
    nameOutEase: "customEase3",
  },
  pagination: {
    barDuration: 0.85,
    barEase: "customEase4",
    // Gallery controls, once the cards are in: slide numbers, active bar, counter, scroll hint.
    introStagger: 0.06,
    introDuration: 0.9,
    introEase: "customEase4",
  },
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
    // Wipe progress at which the scene switcher flips to the incoming scene.
    switcherFlipAt: 0.5,
    // Wipe progress at which the incoming scene is fully revealed. The wipe
    // keeps its duration/ease/radius timeline and simply ends here; the
    // camera's ease spans 0..visibleEnd. Duration on screen is
    // duration * visibleEnd.
    visibleEnd: 0.5,
    // Field progress at which a home <-> page wipe has fully revealed every
    // pixel, including empty backgrounds. The page ease spans 0..pageWipeEnd.
    pageWipeEnd: 0.6,
    // Fraction of the visible span the camera holds before it starts moving;
    // it still lands when the wipe ends.
    cameraDelay: 0.15,
    ease: "customEase3",
  },
};

// Each route owns independent values. Defaults are only construction templates;
// they are not a second set of editable transition controls.
const pick = (group, keys = Object.keys(defaults[group])) =>
  Object.fromEntries(keys.map(key => [key, defaults[group][key]]));
const routes = [
  ['loader', 'home'], ['home', 'project'], ['loader', 'project'],
  ['loader', 'about'], ['project', 'project'], ['project', 'home'],
  ['project', 'about'], ['about', 'project'], ['about', 'home'], ['home', 'about'],
];

export const transitionTimings = Object.fromEntries(routes.map(([from, to]) => {
  const profile = {};
  const add = (group, keys) => { profile[group] = pick(group, keys); };
  if (from === 'loader') {
    add('loader', ['exitDuration', 'exitStagger', 'fadeDuration', 'uiDelay', 'outEase']);
    add('startup', to === 'home'
      ? Object.keys(defaults.startup).filter(key => key !== 'pageFade')
      : ['revealDelay', 'pageFade', 'wipeEase']);
  }
  if (to === 'home' && from !== 'loader') {
    add('homeReturn', from === 'about' ? undefined : Object.keys(defaults.homeReturn).filter(key => !key.startsWith('content')));
  }
  if (from === 'home') {
    add('pages', ['pageScreenDelay', 'pageScreenDuration', 'pageWipeDelay',
      to === 'project' ? 'projectWipeDuration' : 'aboutWipeDuration',
      ...(to === 'project' ? ['projectScreenAt', 'projectDomAt'] : []), 'aboutRevealAt', 'ease', 'screenEase']);
  } else if (from !== 'loader' && to !== 'home' && from !== to) {
    add('pages', ['directDuration', 'aboutRevealAt', 'ease']);
  }
  if (from === 'home' || (to === 'home' && from !== 'loader')) add('cameraZoom');
  if (to === 'about') add('about', Object.keys(defaults.about).filter(key => !key.startsWith('wall')));
  if (from === 'project' && to === 'home') profile.homeReturn.backgroundLead = 1.2;
  if (to === 'project') {
    add('projectSky', from === 'project'
      ? ['switchOutDelay', 'switchOutDuration', 'switchOutEase', 'switchInDuration', 'inEase', 'switchGalleryDelay']
      : ['inDuration', 'inEase', 'pulseAt', 'galleryDelay', ...(from === 'home' ? ['revealAt'] : [])]);
  } else if (from === 'project') add('projectSky', ['outDuration', 'outEase']);
  if (to === 'project') {
    add('gallery', ['galleryInDuration']);
    add('contentReveal', ['delay']);
  }
  add('mono', [
    ...(to !== 'home' ? ['inDuration'] : []),
    ...(from !== 'home' ? ['outDuration'] : []),
  ]);
  if (to === 'project' || to === 'about' || from === 'project' || from === 'about') {
    add('text', [
      ...(to === 'project' ? ['projectIn'] : []),
      ...(to === 'about' ? ['aboutIn', 'aboutTitleDelay', 'aboutBodyDelay'] : []),
      ...(to !== 'home' ? ['heroLineStagger', 'heroEase'] : []),
      ...(from === 'project' || from === 'about' ? ['exitFade', 'exitEase'] : []),
    ]);
  }
  return [`${from}To${to[0].toUpperCase()}${to.slice(1)}`, profile];
}));

// Shared controls contain only values that are not owned by a route.
export const sharedTimings = Object.fromEntries(Object.entries(defaults).flatMap(([group, values]) => {
  const shared = Object.fromEntries(Object.entries(values).filter(([key]) =>
    !Object.values(transitionTimings).some(profile => key in (profile[group] ?? {}))));
  return Object.keys(shared).length ? [[group, shared]] : [];
}));

// Only known numeric/easing leaves can be saved; no executable source is accepted.
export function validateTimingSettings(settings) {
  const walk = (input, schema, path = 'timings') => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error(`${path} must be an object`);
    for (const [key, value] of Object.entries(input)) {
      if (!Object.hasOwn(schema, key)) throw new Error(`Unknown timing: ${path}.${key}`);
      const expected = schema[key];
      if (typeof expected === 'object') walk(value, expected, `${path}.${key}`);
      else if (typeof expected === 'number' ? !Number.isFinite(value) || value < 0
        : typeof value !== 'string' || !Object.hasOwn(easingOptions, value))
        throw new Error(`Invalid timing: ${path}.${key}`);
    }
  };
  walk(settings, { shared: sharedTimings, transitions: transitionTimings });
}

export function applyTimingSettings(settings) {
  validateTimingSettings(settings);
  const apply = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'object') apply(target[key], value);
      else target[key] = value;
    }
  };
  apply({ shared: sharedTimings, transitions: transitionTimings }, settings);
}

export function collectTimingSettings() {
  return JSON.parse(JSON.stringify({ shared: sharedTimings, transitions: transitionTimings }));
}

applyTimingSettings(savedTimings);

// Stable views also support consumers that retain a group reference (gallery,
// page screen, loader). DOM and GPU select independently so queued navigation
// cannot change a running GPU transition's timing context on the main thread.
export function createTimingContext() {
  let active = transitionTimings.loaderToHome;
  const values = Object.fromEntries(Object.entries(defaults).map(([group, entries]) => [group,
    Object.defineProperties({}, Object.fromEntries(Object.keys(entries).map(key => [key, {
      enumerable: true,
      get: () => active[group]?.[key] ?? sharedTimings[group]?.[key] ?? defaults[group][key],
      set: value => {
        const target = key in (active[group] ?? {}) ? active[group] : sharedTimings[group];
        if (target && key in target) target[key] = value;
      },
    }]))),
  ]));
  return {
    timings: values,
    select(from, to) {
      const key = `${from}To${to[0].toUpperCase()}${to.slice(1)}`;
      if (!transitionTimings[key]) return false;
      active = transitionTimings[key];
      return true;
    },
  };
}
const sceneContext = createTimingContext();
const domContext = createTimingContext();
export const timings = sceneContext.timings;
export const mainTimings = domContext.timings;
export const selectTransitionTiming = sceneContext.select;
export const selectMainTransitionTiming = domContext.select;

const timingListeners = new Set();
export function notifyTimingChange(group, key, value = sharedTimings[group]?.[key]) {
  for (const listener of timingListeners) listener({ group, key, value });
}
export function onTimingChange(listener) {
  timingListeners.add(listener);
  return () => timingListeners.delete(listener);
}
