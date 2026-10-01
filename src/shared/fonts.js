// Single place to swap the site's fonts. CSS faces, the preload tag and the
// MSDF atlases (`npm run fonts:msdf`) are all derived from this config.
export const FONTS = {
  sans: {
    family: "Suisse Intl",
    fallback: "Arial, sans-serif",
    dir: "assets/fonts/msdf/SuisseIntl",
    preload: 400,
    faces: {
      400: "SuisseIntl-Regular.otf",
      450: "SuisseIntl-Book.otf",
      500: "SuisseIntl-Medium.otf",
      600: "SuisseIntl-SemiBold.otf",
    },
  },
  mono: {
    family: "Suisse Intl Mono",
    fallback: "ui-monospace, monospace",
    file: "assets/fonts/msdf/SuisseIntlMono/SuisseIntlMono-Regular.otf",
    // Rewritten by `npm run fonts:msdf` when it generates atlases for `file`.
    atlas: {
      msdf: "assets/fonts/msdf/SuisseIntlMono/msdf/SuisseIntlMono-Regular",
      hint: "assets/fonts/msdf/SuisseIntlMono/hint/SuisseIntlMono-Regular",
    },
  },
};

export const fontFaces = () => [
  ...Object.entries(FONTS.sans.faces).map(([weight, file]) => ({
    family: FONTS.sans.family, weight, src: `${FONTS.sans.dir}/${file}`,
  })),
  { family: FONTS.mono.family, weight: "400", src: FONTS.mono.file },
];
