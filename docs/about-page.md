# About page

The global header lives in `src/main/navigation.js`; the About DOM content and
page lifecycle live in `src/main/pages/AboutPage.js`. Its layout uses the same
outer gutter for the header, hero, rules, and lower sections. Below 700px the
portrait moves above the copy; awards become two columns below 1000px.

Change the font sources and `--font-family` in
`src/main/styles/typography.css` to replace the DOM font throughout the site.
The supplied Suisse Light, Book, and Medium files are registered there.
`--type-scale` in `site.css` controls the overall DOM type size. Navigation and
availability share `--nav-font-size`; the email alone sets the availability
width, with its status line filling the available space.
Space Mono is used for the email, section labels, award counts, and bracketed
service categories. The existing decorative GPU
text wall retains its separate MSDF atlas.

`formatMonoLabels` applies uppercase bracketed labels before SplitText runs.
The grid hint is a separate MSDF child of the grid, so it stays visible while
hovering hides project callouts. Its right anchor follows the tile bounds;
it uses a small Space Mono atlas with square-bracket glyphs.

The project canvas presentation now mounts a two-viewport scroll surface and
uses the same PageScroll lifecycle as About. Gradient, horizon, and noise all
sample the shared scroll offset. Both routes restore scroll and controls on exit.

`SplitTextAnimation` owns each GSAP split, responsive line resplitting,
interruptible `in()` / `out()` promises, `reset()`, and `destroy()`. Destroy
reverts the original accessible markup and removes SplitText's observers.
Page teardown also removes its ScrollTriggers, tweens, Lenis instance, and
GSAP ticker callback. All new easing uses the shared `CUSTOM_EASE` alias.

`PageScroll` owns Lenis and is shared by routed pages. It sends CSS-pixel
scroll offsets to the worker. The portrait moves upward with the hero; the
existing wall rows wrap vertically through the viewport and the shared noise
background moves with page scroll.
This preserves the existing shared camera and scene transitions, and does not
increase the wall's geometry count. Navigation queues the latest requested
page until an active scene transition finishes.

Validation: use Node 22.12+ for `pnpm build`. Browser checks should cover
desktop and mobile deep links, wheel/touch scroll, back-to-top, resize during
a reveal, Home/About interruptions, project/About navigation, browser
back/forward, and reduced motion. On Home, no About markup, ScrollTriggers,
or Lenis classes should remain; re-entering About starts at scroll zero.
