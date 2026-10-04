// Load-time switches. URL params stay in query.js; Inspector toggles stay in params.js.

// Nothing renders above this: tiers, project pages, the loader, recordings.
export const MAX_DPR = 2;

export function clampDpr(dpr) {
  return Math.min(dpr || 1, MAX_DPR);
}

// Active music reference: a folder in src/audio/references/, generated from
// scripts/audio/references/<name>/ by `npm run audio:generate`.
export const AUDIO_REFERENCE = "contrapoint";

// False skips the ice trail targets and trail pass.
export const ENABLE_ICE_TRAIL = true;

// False skips the VAT rose, its pointer trail, ripples, updates, and downloads.
export const ENABLE_ROSE_TRAIL = true;

// False keeps the renderer at a fixed resolution.
export const ENABLE_ADAPTIVE_RESOLUTION = true;

// False generates the noise and glyph glow textures while loading instead of
// downloading the ones `npm run textures:bake` writes. Same pixels and memory.
export const ENABLE_BAKED_TEXTURES = true;

// False blurs gallery images on the render worker instead of downloading the
// blurs `npm run media:projects` writes. Runtime blurs keep about 1 MB of float
// buffers per portrait; baked ones keep only their 128px bitmap.
export const ENABLE_BAKED_GALLERY_BLURS = true;

// Site fonts, by key in SANS_FONTS / MONO_FONTS (src/shared/fonts.js).
// A new mono font needs `npm run fonts:msdf` once for its 3D text atlases.
export const SANS_FONT = "suisseIntl"; // "suisseIntl" | "khTeka"
export const MONO_FONT = "spaceMono"; // "spaceMono" | "suisseIntlMono"
