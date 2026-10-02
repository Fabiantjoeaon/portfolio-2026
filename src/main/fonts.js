import { FONTS, fontFaces, fontFormat } from "@/shared/fonts";

// The headless shader capture runs this module without the CSS Font Loading API.
if (typeof FontFace === "function") {
  const base = import.meta.env.BASE_URL;
  for (const { family, weight, src } of fontFaces()) {
    document.fonts.add(new FontFace(family, `url("${base}${src}") format("${fontFormat(src)}")`, { weight, display: "swap" }));
  }
  const root = document.documentElement.style;
  root.setProperty("--font-family", `"${FONTS.sans.family}", ${FONTS.sans.fallback}`);
  root.setProperty("--font-mono", `"${FONTS.mono.family}", ${FONTS.mono.fallback}`);
  for (const [name, weight] of Object.entries(FONTS.sans.weights)) root.setProperty(`--w-${name}`, weight);
}
