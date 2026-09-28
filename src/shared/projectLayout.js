/** Matches `--page-gutter: clamp(20px, 3vw, 64px)`. */
const pageGutter = width => Math.min(64, Math.max(20, width * 0.03));

/** Shared CSS-pixel layout keeps the incoming screen and DOM exactly aligned. */
export function projectLayout(width, height, mobile = width <= 700) {
  const aspect = mobile ? 3 / 4 : 16 / 9;
  const gutter = pageGutter(width);
  // Portrait mobile fills the page column and grows the hero to fit the title
  // and caption. Desktop and landscape stay centered and height-bound.
  if (mobile && width <= height) {
    const mediaWidth = width - gutter * 2;
    const mediaHeight = mediaWidth / aspect;
    const heroHeight = Math.max(height, 700, mediaHeight + 420);
    return { heroHeight, mediaWidth, mediaHeight, gap: 12, top: (heroHeight - mediaHeight) / 2, left: gutter };
  }
  const heroHeight = Math.max(height, mobile ? 700 : 640);
  const mediaWidth = Math.min(width * (mobile ? 0.78 : 0.56), heroHeight * (mobile ? 0.56 : 0.52) * aspect);
  const mediaHeight = mediaWidth / aspect;
  return { heroHeight, mediaWidth, mediaHeight, gap: mobile ? 12 : Math.min(120, width * 0.08),
    top: (heroHeight - mediaHeight) / 2, left: (width - mediaWidth) / 2 };
}
