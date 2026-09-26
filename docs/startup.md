# Startup

The default loader shows the identity, a smoothed 0–100 counter, and role on
black. Asset loading accounts for 95%; GPU preparation completes the remaining
5%. The counter never moves backwards. Once the renderer and prepared audio
engine are ready, the three items exit in left-to-right order and reveal the
keyboard-accessible **Click to enter** button.

That gesture resumes audio and unlocks the buffered project videos. The button
exits to black, then the first scene enters through the existing world-position
wipe. Screen and tile entrances begin together with that wipe, reusing the home
return animations. The scene cycle and interactions stay paused until entry
finishes. Direct project/About routes select their destination under the loader
and reveal that page's content from black on entry, without showing Home.

`timings.startup` controls the world wipe. Screen/tile durations and eases reuse
`timings.homeReturn`, with both startup delays set to zero. The shader is prepared
behind the loader; the visible entrance changes uniforms rather than rebuilding
materials. Audio voices and reverb are prepared before the entry gesture.

Use `?skipLoader` (or `&skipLoader` after other parameters), or
`init({ skipLoader: true })`, to keep the previous progress-bar loader and startup
without the entry gate or new entrance. `?skipLoader=false` uses the new loader.
Reduced motion keeps the entry gesture but skips the exit and scene animations.

Check desktop/mobile layout, progress completion, mouse/keyboard entry, audio
unlock, a black waiting scene, simultaneous screen/tiles, queued direct routes,
reduced motion, and the legacy flag in both worker and main-thread debug modes.
