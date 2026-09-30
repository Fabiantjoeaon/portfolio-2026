# Transition timings

Open `?debugAnimations` to edit one folder per source/destination:
Loader → Home, Loader → Project, Loader → About, Home → Project,
Home → About, Project → Project, Project → Home, Project → About,
About → Project, and About → Home.

Each folder contains only the animation groups used by that transition.
Values are independent even when their initial defaults match. Changing
Project → Home does not change About → Home. Shared contains loading,
tile animation, interaction, scrolling, and world-cycle controls, without duplicate route controls.

- Durations and delays are seconds; `At` and `visibleEnd` controls are fractions.
- Camera Zoom `startAt` / `endAt` select the portion of the wipe over which the
  zoom runs. Keep start below end. `zoomFactor` sets its amount and `ease` its curve.
- Loader → Home retains its separate camera `zoomFrom`, `zoomDuration`, and `zoomEase`.
- Gallery `inEase` and `outEase` control entrance and exit separately; Shared Gallery
  `ease` controls gallery interaction and scrolling reveals.
- Shared → Tiles contains tile exit duration/stagger/ease, loader startup reveal,
  and home-return reveal. Reveal delays are relative to the screen start.
- Content Reveal orders the project hero (title, gallery, credits, pagination)
  along the top-left to bottom-right diagonal. Each route into a project owns its
  `delay`; Shared → Content Reveal holds the `stagger` between items and `duration`.
- Project → Project uses the sky and gallery out/in controls, with no scene wipe.
- Loader → Project prepares the sky beneath the loader, so its visible reveal is
  controlled by Startup, Gallery, and Text rather than a second sky entrance.

Click **Save timings** at the top of the animation panel while running the dev
server. It writes all route and shared timing values to
`src/shared/timings.saved.json`, which is loaded on startup and included in builds.
The button reports saved/no changes or a failure. Unsaved edits remain in memory.

`src/shared/timings.js` defines the defaults and route groups; saved values override
those defaults. The scene panel's existing save button also includes timings when
the animation panel is open. The animation panel's button saves only timings.

DOM and GPU consumers retain stable timing views with independent route selection,
so preparing a DOM navigation does not change the running GPU transition.
