// Font presets; SANS_FONT / MONO_FONT in flags.js pick one of each. CSS faces,
// weights, the preload tags and the MSDF atlases are all derived from FONTS.
import { MONO_FONT, SANS_FONT } from "./flags.js";

export const SANS_FONTS = {
  suisseIntl: {
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
    // Weights the CSS asks for (--w-*); each should map to one of `faces`.
    weights: { light: 400, regular: 400, book: 450, medium: 500 },
  },
  khTeka: {
    family: "KH Teka",
    fallback: "Arial, sans-serif",
    dir: "assets/fonts/msdf/KHTeka",
    preload: 400,
    faces: {
      400: "KHTekaTRIAL-Regular.otf",
      500: "KHTekaTRIAL-Medium.otf",
    },
    weights: { light: 400, regular: 400, book: 400, medium: 500 },
  },
};

// 3D text atlases live next to `file` in msdf/ and hint/ (`npm run fonts:msdf`).
export const MONO_FONTS = {
  spaceMono: {
    family: "Space Mono",
    fallback: "ui-monospace, monospace",
    file: "assets/fonts/msdf/SpaceMono/SpaceMono-Regular.ttf",
  },
  suisseIntlMono: {
    family: "Suisse Intl Mono",
    fallback: "ui-monospace, monospace",
    file: "assets/fonts/msdf/SuisseIntlMono/SuisseIntlMono-Regular.otf",
  },
};

const atlas = (file, kind) => {
  const slash = file.lastIndexOf("/");
  return `${file.slice(0, slash)}/${kind}/${file.slice(slash + 1).replace(/\.\w+$/, "")}`;
};

const mono = MONO_FONTS[MONO_FONT];
export const FONTS = {
  sans: SANS_FONTS[SANS_FONT],
  mono: { ...mono, atlas: { msdf: atlas(mono.file, "msdf"), hint: atlas(mono.file, "hint") } },
};

const FORMATS = { otf: "opentype", ttf: "truetype", woff: "woff", woff2: "woff2" };
const extension = src => src.split(".").pop().toLowerCase();
export const fontFormat = src => FORMATS[extension(src)];
export const fontMime = src => `font/${extension(src)}`;

export const fontFaces = () => [
  ...Object.entries(FONTS.sans.faces).map(([weight, file]) => ({
    family: FONTS.sans.family, weight, src: `${FONTS.sans.dir}/${file}`,
  })),
  { family: FONTS.mono.family, weight: "400", src: FONTS.mono.file },
];
