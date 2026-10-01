import { FONTS, fontFaces } from "@/shared/fonts";

const base = import.meta.env.BASE_URL;
for (const { family, weight, src } of fontFaces()) {
  document.fonts.add(new FontFace(family, `url("${base}${src}") format("opentype")`, { weight, display: "swap" }));
}
const root = document.documentElement.style;
root.setProperty("--font-family", `"${FONTS.sans.family}", ${FONTS.sans.fallback}`);
root.setProperty("--font-mono", `"${FONTS.mono.family}", ${FONTS.mono.fallback}`);
