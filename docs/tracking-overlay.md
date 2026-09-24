# Tracking overlay

`src/offscreen/effects/TrackingOverlay.js` is the reusable renderer. Meadow's VAT decoding, plant selection, and obstacle bounds live separately in `MeadowTracking.js`.

Create the overlay once, add it directly to the scene, and await `overlay.ready` before shader preparation. Supply a reusable array of `{ position: Vector3, opacity: number, size: number }` targets; positions are world coordinates and sizes are CSS pixels. Before each main scene render, call:

```js
overlay.update(camera, viewport, targets, targetCount, exclusionCorners, solidBounds);
```

`viewport` supplies CSS `width` and `height`. `exclusionCorners` are world-space points enclosing protected screen content; the renderer conservatively excludes their projected rectangle, including labels and line clearance. `solidBounds` is an array of world-space `Box3` obstacles: any connecting segment that intersects one is rejected. Keep anchors on the visible side of surfaces. Hide the overlay during reflection rendering and call `dispose()` when releasing the scene. The shared font atlas remains cache-owned.

The default budget is 24 SDF markers, 20 instanced Makio MeshLine segments, and 144 glyphs: at most three draw calls. Buffers and text layouts are created once. Positions, opacity, and draw ranges update in place. No readbacks, motion detection, extra render targets, or per-frame geometry construction are involved. It runs inside the existing renderer worker and participates in scene transitions and shader prewarming.

Meadow caches one stem vertex's 170 VAT positions at startup. It samples those positions with the same growth, lean, rotation, emergence, and collapse as the roses. Random selection stays stable for each birth, with newer roses preferred when the pool recycles. Wall markers reacquire slowly while faded out. Marker spacing, a two-link degree limit, and a pixel-length cap keep the result sparse.

Run the obstacle regressions with `node --test scripts/test-tracking-overlay.mjs`.
