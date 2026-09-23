# Avatar capture investigation

Reference: supplied `CaptureSite/lusion.co.har`, `out/ARCHITECTURE.md`, program shaders, and framebuffer exports. These files were inspected as rendering evidence.

## What the capture establishes

- **Program 08 is the avatar**, including draws 00151 and 00161. It draws 8,192 instanced quads per face; the two draws support a transition between faces. Position and normal/luminance data occupy 128 × 64 textures. There is no particle physics simulation in this pass.
- Quads use **additive ONE + ONE blending**, with depth testing and writing disabled. Lighting combines stored luminance, normals, a mouse-positioned light, distance attenuation, and a front-facing mask.
- Depth changes particle size and softness. Larger, defocused particles receive less intensity. A horizontal scan band raises brightness, and occasional horizontal bands displace together.
- The reveal staggers particles by height and a random seed, with coherent noise displacement fading as they settle. A glitch tint calculated in the vertex shader is unused by the captured fragment shader.
- The avatar pass emits grayscale. Subsequent grading supplies color; bloom uses extraction, FFT convolution, and compositing (programs 10–15). Those repeated passes are not extra avatar geometry.
- Terrain contours (program 06), scrolling characters (09), and SMAA (19–21) are separate effects.

## Asset format distinction

The reference `.buf` begins with a little-endian uint32 JSON-header length, followed by the JSON header and attribute blocks. The inspected asset declares 8,192 vertices, packed Uint16 XYZ positions, and Uint8 RGBA normal/luminance values. Positions unpack as `packed / 65536 * delta + from`.

This project's `public/assets/about/head.buf` is different: 40,000 little-endian Float32 rows of `[x, y, z, nx, ny, nz, luminance]`. Its existing loader remains appropriate. The supplied portrait is a depth relief with shoulders, so small rotations preserve its appearance better than large rotations. Reference face assets are not needed by this implementation.

## Implementation and adaptations

`portraitMaterial.js` implements additive dots, normal/luminance lighting with a moving light, depth focus, banded glitches, and the staggered scatter reveal in Three.js TSL. Instanced attributes replace the reference data textures. `ParticlePortrait.js` retains the project's portrait asset and placement, updates lighting and density, and owns reveal timing independently of the text wall.

Bloom is approximated with a local radial halo per particle, rather than the reference's FFT convolution. This avoids changing the scene-wide compositor. Colors are applied within the portrait material to fit the existing About palette; the result is an adaptation rather than a pixel-identical reproduction of the full captured pipeline.

Controls live under **AboutScene → Portrait**: Focus adjusts depth softness and glow, Signal adjusts glitches, and Motion includes reveal duration/scatter. Existing layout, density, lighting, and dither controls remain available. Density selects a subset of the shuffled source points, with viewport-dependent reduction on narrow screens.

Validation: production build and live WebGPU rendering at 1440 × 900 and 390 × 844 completed without browser/GPU errors. Browser checks covered live uniform binding and save serialization, responsive/zero density, visibility, reveal reset/timing/completion, mouse lighting, shader controls, and disposal. The partial reveal was also captured for visual inspection.

The portrait scan was subsequently removed. The About word grid has its own selective glyph glow and defocus, with occasional outward pulses; controls live under **AboutScene → Wall → Focus**. It filters glyph coverage within the existing text batch, preserving the surrounding crisp text and the page reveal.
