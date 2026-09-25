# Project page

Project pages use the same Suisse/Space Mono tokens, SplitTextAnimation,
ScrollTrigger rules and PageScroll (Lenis) lifecycle as About. The title,
center image, metadata and numbered navigation share their horizontal edges.
The image is centered vertically in the hero; short viewports get enough hero
height to keep the title and credits readable. Both the DOM and GPU read
`src/shared/projectLayout.js`, including the incoming project-screen transition.

The dimmed neighboring images are the previous/next controls. Their transparent
DOM hit areas are semantic buttons for keyboard and screen-reader access, with
no visible arrows or text buttons. Swipe horizontally, use left/right keys in
the gallery, or choose a number. Vertical touch gestures continue page scrolling.

`ProjectGallery` owns three GPU panels and wraps their source/target texture
indices modulo the number of slides. Its TSL shader carries over ProjectImage.js's
ten vertical bands, 20% directional stagger and incoming scale from 0.8 to 1.
The stagger and horizontal UV motion reverse together. Exact endpoints remain
undistorted, including first/last-slide wrapping. Repeated inputs coalesce to a
pending destination. Reduced-motion requests change the image immediately.

Gallery images load once per visit and are released, with their ImageBitmaps,
on exit. A late image load is aborted on disposal. The existing video frame
stream remains the first slide where a supplied reel exists. Missing reels
use the still gallery, avoiding requests for nonexistent files.

All credits and descriptions are explicitly **placeholder content**, as requested.
Edit them in `src/shared/projects.js`. Each project's `media` array accepts
`{ type: 'image', src, alt }` records after the optional film. Replace those paths
with the final project images. The current stills are temporary frames extracted
from the five supplied reels; some projects share a placeholder set. Regenerate
missing stills with `node scripts/generate-project-previews.mjs` (requires ffmpeg).

Validation covers desktop and mobile alignment, both wrap directions, numbered
navigation, touch swipes versus vertical page scroll, rapid input, reduced motion,
and gallery cleanup across Project/About/Home navigation.
