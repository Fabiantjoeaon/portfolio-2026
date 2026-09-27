/** Shared CSS-pixel layout keeps the incoming screen and DOM exactly aligned. */
export function projectLayout(width, height, mobile = width <= 700) {
  const heroHeight = Math.max(height, mobile ? 700 : 640);
  const aspect = mobile ? 3 / 4 : 16 / 9;
  const mediaWidth = Math.min(width * (mobile ? 0.78 : 0.56), heroHeight * (mobile ? 0.56 : 0.52) * aspect);
  const mediaHeight = mediaWidth / aspect;
  return { heroHeight, mediaWidth, mediaHeight, gap: mobile ? 16 : Math.min(120, width * 0.08),
    top: (heroHeight - mediaHeight) / 2, left: (width - mediaWidth) / 2 };
}
