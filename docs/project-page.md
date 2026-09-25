# Project page

Project pages use the same Suisse/Space Mono tokens, SplitTextAnimation,
ScrollTrigger rules and PageScroll (Lenis) lifecycle as About. The title,
center image, metadata and numbered navigation share their horizontal edges.
The image is centered vertically in the hero; short viewports get enough hero
height to keep the title and credits readable. Both the DOM and GPU read
`src/shared/projectLayout.js`, including the incoming project-screen transition.

The dimmed neighboring images are the previous/next controls. Their transparent
DOM hit areas are semantic buttons for keyboard and screen-reader access, with
no visible arrows or text buttons. Drag, swipe, scroll horizontally (or Shift +
wheel), use left/right keys in the gallery, or choose a number. Vertical touch
gestures and wheel events continue page scrolling.

`GalleryMotion` tracks an unbounded horizontal position in slide pitches with
frame-independent interpolation. Release snaps to the nearest image with a
bounded velocity bias; horizontal wheel input snaps after a configurable idle
delay. `ProjectGallery` recycles five GPU panels outside the viewport and wraps
image indices modulo the slide count. Every panel remains one solid quad.
The fragment shader divides its texture into fixed vertical bands, translating,
scaling and darkening the image within each band. The outermost bands transform
most. Left/right 0–1 distance lerps use PAGE_EASE and mirrored staggering to
settle each band as the panel reaches center. Overscan keeps translated samples
inside the texture, without gaps, stretched edges or repeating UVs. Keeping both
sides continuous prevents direction flips during reversals. Reduced motion
disables the band effect and position smoothing.

All choreography lives in `src/shared/timings.js`. Durations/delays are seconds;
lerps are amounts at 60fps, adjusted to elapsed frame time. Lower lerps produce a
softer, longer follow; 1 follows immediately. Easing names use the registered
`customEase1`–`customEase5` and `pageEase` curves.

| Timing group | Controls |
| --- | --- |
| `homeReturn` | About content fade; home wipe, screen and tile durations, delays and easings |
| `pages` | Entry wipe and screen choreography, DOM reveal thresholds, direct page dissolve |
| `tiles` | Exit/preview duration, diagonal stagger and easing |
| `gridLabels` | Callout entrance, stagger and project hint scramble |
| `gallery` | Input/snap/shader lerps, directional slice stagger, image entrances, neighbor delays and opacity exit |
| `about` | Text wall and portrait entrance |
| `text` | SplitText, rules, pagination and DOM exits |
| `navigation` | Labels, underline, availability and pulse |
| `hover` / `scroll` / `world` | Screen hover, Lenis and home scene cycle |

Timing controls live in the separate **Animation timings** debug window and
update the shared runtime values immediately. They remain absent from `params.js`.
Every easing field is a dropdown sourced from `easingDefinitions` in
`src/shared/timings.js`; add future built-in or custom curves to that one list.
Visual settings remain live under **PersistentScene → Gallery** in `?debug`:
band count, texture scale, darkness/curve, first-slice offset, additional spread,
reveal distance and flick influence. **Save to params.js** persists these visual
settings. Run `node scripts/test-gallery-motion.mjs` for motion, visual parameter
persistence and timing ownership checks.

Gallery images load once per visit and are released, with their ImageBitmaps,
on exit. A late image load is aborted on disposal. The existing video frame
stream remains the first slide where a supplied reel exists. Missing reels
use the still gallery, avoiding requests for nonexistent files.

From Home, the screen moves into the project layout during the wipe's tail
(`timings.pages.projectScreenAt`, default 0.58), after the tiles finish leaving.
Hero DOM fades and masked line reveals overlap the screen's settle. Neighboring
gallery images then enter one by one using the band shader. Tile appearance and
disappearance both run top-left to bottom-right, combining scale with the live
hover quaternion; Tiles Rotation adjusts the added turn.
Project → Project keeps the project scene and hidden grid in place: the old
gallery fades out while new textures preload, then the center image enters with
the band animation, followed by its neighbors. Every gallery exit freezes its
texture transforms and screen-space pose and fades only opacity. On the way home,
both the DOM and GPU content finish exiting before the world wipe starts.
The screen follows 0.45s into the wipe, with tiles starting another 0.25s later.
Screen and tiles ease in over 1.1s and 1.5s respectively; the wipe lasts 1.65s.
Controls and scene cycling resume after the entire sequence completes. Navigation
requests during that sequence are queued, with the latest destination winning.
Reduced motion skips the GPU choreography.
Project ↔ About uses a direct 1.4s scene
dissolve, overlapping the gallery and DOM exit. Neither path calls the home
exit or restores grid controls. About's Back link returns to the originating
project. Browser history and queued navigation use the same path.

All credits and descriptions are explicitly **placeholder content**, as requested.
Edit them in `src/shared/projects.js`. Each project's `media` array accepts
`{ type: 'image', src, alt }` records after the optional film. Replace those paths
with the final project images. The current stills are temporary frames extracted
from the five supplied reels; some projects share a placeholder set. Regenerate
missing stills with `node scripts/generate-project-previews.mjs` (requires ffmpeg).

Validation covers desktop and mobile alignment, both wrap directions, numbered
navigation, touch swipes versus vertical page scroll, rapid input, reduced motion,
and gallery cleanup across Project/About/Home navigation.
