# Shared ambient particles

`src/offscreen/particles/ParticleSystem.js` is a repeating, instanced billboard
emitter. It uses one draw, no compute pass, and no per-frame attribute uploads.
Add it to any scene, call `update(deltaSeconds)` while that scene is active, and
call `dispose()` when the scene is destroyed. Object transforms move/scale the
whole emitter. Positions, bounds, sizes and velocity use local scene units.

```js
import { ParticleSystem } from "../particles/ParticleSystem.js";

const particles = new ParticleSystem({
  maxCount: 500,
  settings: {
    count: 100, lifetime: 12, delay: 1, fadeIn: 1, fadeOut: 2,
    origin: [0, 3, 0], bounds: [30, 12, 30], velocity: [0, 0.2, 0],
    size: 0.3, color: 0x90acff, opacity: 0.4,
  },
});
scene.add(particles);
particles.update(deltaSeconds);
particles.configure({ enabled: false }); // hides draw and pauses its clock
particles.reset(); // restarts the staggered population
particles.dispose();
```

The default appearance is a soft dot. `lifetimeVariation` and `sizeVariation`
range from 0–1, reaching ±50% variation at 1. `delay` is time between lives;
`fadeIn`/`fadeOut` are seconds, limited to half the lifetime each. `speed` scales
the clock (0 pauses); `drift` and `driftSpeed` control smooth floating motion;
`rotationAmount` bounds the tilt in degrees (0 keeps sprites upright), while
`rotationSpeed` sets the sway phase speed in radians/second (0 holds a static
tilt). `bounds` describes the spawn volume, not a
collision boundary: velocity and drift can take particles outside it.

For glyphs, await the shared `loadMSDFFont()` and pass its result to
`createGlyphAppearance({ font, map })`. Supply the returned `appearance` to
`ParticleSystem`; its `controls` expose symbol interval, per-particle interval
variation, glow strength and glow radius. Each particle picks random characters
from `0123456789!@#$%&*` at staggered intervals. `intervalVariation` ranges from
a shared cadence at `0` to a stable 50–150% cadence range at `1`. Override
`characters` with glyphs present in your atlas.
The Three.js Blocks font parser supplies atlas and glyph metrics.
The atlas is shared and must not be disposed by individual scenes.
The appearance owns a small preblurred glyph atlas: call its returned `dispose()`
after disposing the particle system.

Custom appearances receive `{ age, progress, seed, clock, uniforms }` and return
`colorNode`, `opacityNode`, and optionally a 2D `scaleNode`. Lifecycle nodes are
vertex expressions: wrap them in TSL `varying()` for fragment use. All particles
share one material. Additive blending avoids sorting within the particle draw;
depth testing keeps opaque walls in front. There is no collision simulation.

Cube settings live under `params.CubeScene.Particles`, exposed in the Inspector
as **CubeScene → Particles**. The core uses one MSDF atlas sample; the glow uses
one padded, preblurred glyph coverage sample and follows the character strokes.
The blur atlas is generated once using the shared About typography helper.
Glow strength controls its HDR energy, radius its spread. Overall opacity still
affects both glyph and halo. There are no bloom targets, per-frame blur passes,
extra glow meshes, or new downloaded assets.
