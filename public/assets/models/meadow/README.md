# Meadow plant wall

`plant-wall.glb` is derived from the user-supplied `v7.FBX` in
`verticalgarden-green-wall-07` (3DTree Verticalgarden 07). Retain the source
asset's license when redistributing it; no source models are bundled here.

Runtime asset: 4,120,940 bytes, 234,086 triangles, one foliage primitive,
Draco geometry and two 2048² WebP atlases (color/cutout and normal).
The loose sample plants and original concrete backing are excluded. Geometry
is normalized to X/Z [-0.5, 0.5], Y [0, 1]; the scene applies its dimensions.

Rebuild with Blender 4.2+ from the repository root:

```sh
blender --background --python scripts/build-meadow-wall.py -- /path/to/verticalgarden-green-wall-07/v7.FBX
```

Keep the `3DTree_Verticalgarden_07` texture directory beside the FBX. The
conversion simplifies to 8% of the source polygons, packs material UVs with
mipmap gutters, and compresses the geometry and images. The runtime uses
opaque alpha-tested leaves, avoiding transparent sorting and double passes.
The loader owns the shared geometry/textures; scene disposal releases its own
materials, shoreline profile, water normals clone and reflection target.

Preview: `/?scene=meadow&manual&debug`. All controls are under `MeadowScene`.
The screen's back emission lights the plants; both faces light the water.
A small ambient light supplies the overcast fill. There is no sun or HDRI.

The shoreline shader samples a 256-column front contact envelope derived from
triangle/water intersections. Submersion/height edits rebuild the envelope;
position/width/depth edits update its world mapping. It represents the visible
front of the dense wall, not individual alpha-cutout leaf silhouettes.
Reflections combine the wall, grid and screen in one half-resolution target,
updated every other frame by default. Resolution and cadence are adjustable.

Meadow also uses the shared `createVolumetricFog` scene postprocessing effect,
with its base following the water level. `Fog` controls expose density, height,
billows, screen illumination and sample count (16 by default).

`MeadowRain` draws a fixed budget of 3,072 instanced streaks, with intensity
selecting a stable subset. The GPU drop trajectories and water shader share
cell positions, cycle seeds and a clock: each landing starts a fading radial
normal disturbance and small impact highlight. Nine nearby cells bound the
water shader's work without a particle collision pass or texture assets.
Ripple lifetime/radius are bounded by the fall period/cell spacing to avoid
cycle resets and cell seams. `Rain` controls affect the drops and impacts
together. The water already exists, so impacts produce ripples rather than
accumulating puddles. This adapts the reference's normal-perturbation approach
to the project's WebGPU/TSL materials; it does not import its WebGL composer.
