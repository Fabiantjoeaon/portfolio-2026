/** Matches `--page-gutter: clamp(20px, 3vw, 64px)`. */
const pageGutter = width => Math.min(64, Math.max(20, width * 0.03));

// Portrait mobile space around the media: header and a two-line title above,
// metadata and pagination below.
const PORTRAIT_ABOVE = 165;
const PORTRAIT_BELOW = 135;

/**
 * Shared CSS-pixel layout keeps the incoming screen and DOM exactly aligned.
 * `visibleHeight` is the viewport left with every browser toolbar expanded.
 */
export function projectLayout(width, height, mobile = width <= 700, visibleHeight = height) {
  const aspect = mobile ? 3 / 4 : 16 / 9;
  const gutter = pageGutter(width);
  // Portrait mobile fills the page column; the media gives up height so the
  // title, gallery and caption all fit above the fold. Desktop and landscape
  // stay centered and height-bound.
  if (mobile && width <= height) {
    const mediaWidth = width - gutter * 2;
    const visible = Math.min(visibleHeight, height);
    const mediaHeight = Math.max(mediaWidth * 0.6,
      Math.min(mediaWidth / aspect, visible - PORTRAIT_ABOVE - PORTRAIT_BELOW));
    const top = PORTRAIT_ABOVE;
    const heroHeight = Math.max(height, top + mediaHeight + PORTRAIT_BELOW);
    return { heroHeight, mediaWidth, mediaHeight, gap: 12, top, left: gutter };
  }
  const heroHeight = Math.max(height, mobile ? 700 : 640);
  const mediaWidth = Math.min(width * (mobile ? 0.78 : 0.56), heroHeight * (mobile ? 0.56 : 0.52) * aspect);
  const mediaHeight = mediaWidth / aspect;
  return { heroHeight, mediaWidth, mediaHeight, gap: mobile ? 12 : Math.min(120, width * 0.08),
    top: (heroHeight - mediaHeight) / 2, left: (width - mediaWidth) / 2 };
}
