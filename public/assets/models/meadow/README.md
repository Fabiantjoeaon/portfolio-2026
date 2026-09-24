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
