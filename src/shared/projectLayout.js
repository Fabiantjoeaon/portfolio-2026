/** Matches `--page-gutter: clamp(20px, 3vw, 64px)`. */
const pageGutter = width => Math.min(64, Math.max(20, width * 0.03));

// Portrait mobile space around the media: header and a two-line title above,
// metadata and pagination below.
const PORTRAIT_ABOVE = 165;
const PORTRAIT_BELOW = 135;
// Landscape touch: header and up to two title lines above, caption below.
const LANDSCAPE_ABOVE = 150;
const LANDSCAPE_BELOW = 24;
const LANDSCAPE_CAPTION = 180;

/**
 * Shared CSS-pixel layout keeps the incoming screen and DOM exactly aligned.
 * `visibleHeight` is the viewport left with every browser toolbar expanded.
 */
export function projectLayout(width, height, mobile = width <= 700, visibleHeight = height) {
  const gutter = pageGutter(width);
  const visible = Math.min(visibleHeight, height);
  // Portrait mobile fills the page column; the media gives up height so the
  // title, gallery and caption all fit above the fold.
  if (mobile && width <= height) {
    const mediaWidth = width - gutter * 2;
    const mediaHeight = Math.max(mediaWidth * 0.6,
      Math.min(mediaWidth * 4 / 3, visible - PORTRAIT_ABOVE - PORTRAIT_BELOW));
    const top = PORTRAIT_ABOVE;
    const heroHeight = Math.max(height, top + mediaHeight + PORTRAIT_BELOW);
    return { heroHeight, mediaWidth, mediaHeight, gap: 12, top, left: gutter };
  }
  const aspect = 16 / 9;
  // Landscape touch keeps the title and the whole media on the first screen.
  if (mobile) {
    const mediaWidth = Math.min(width * 0.7, (visible - LANDSCAPE_ABOVE - LANDSCAPE_BELOW) * aspect);
    const mediaHeight = mediaWidth / aspect;
    const top = Math.max(LANDSCAPE_ABOVE, (visible - mediaHeight) / 2);
    const heroHeight = Math.max(height, top + mediaHeight + LANDSCAPE_CAPTION);
    return { heroHeight, mediaWidth, mediaHeight, gap: 12, top, left: (width - mediaWidth) / 2 };
  }
  const heroHeight = Math.max(height, 640);
  const mediaWidth = Math.min(width * 0.56, heroHeight * 0.52 * aspect);
  const mediaHeight = mediaWidth / aspect;
  return { heroHeight, mediaWidth, mediaHeight, gap: Math.min(120, width * 0.08),
    top: (heroHeight - mediaHeight) / 2, left: (width - mediaWidth) / 2 };
}
