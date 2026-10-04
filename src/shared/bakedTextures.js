// Textures baked into public/ and the parameters they were baked with. Runtime
// code builds the same textures itself when a file is missing or its size no
// longer matches.
import { FONTS } from "./fonts.js";

export const FBM_NOISE = {
  ice: { size: 256, octaves: 4, persistence: 0.5 },
  meadow: { size: 128, octaves: 4, persistence: 0.5 },
};

export const fbmNoisePath = ({ size, octaves, persistence }) =>
  `assets/textures/baked/fbm-${size}-${octaves}-${persistence}.bin`;

export const PARTICLE_GLYPHS = "0123456789!@#$%&*";

/** Prefiltered glow atlas of the mono MSDF font: every glyph, or the particle set. */
export const glyphGlowPath = (set) => `${FONTS.mono.atlas.msdf}.glow-${set}.bin`;

/** Gallery backdrop of a still or poster blurred by `sigma` texels; `npm run media:projects` writes it. */
export const blurPath = (still, sigma) => still.replace(/\.webp$/, `.blur${sigma}.webp`);
export const BLUR_FILE = /\.blur[\d.]+\.webp$/;
