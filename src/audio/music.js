import { AUDIO_REFERENCE } from "./reference.js";

const generatedFiles = import.meta.glob("./references/*/music.generated.js", { eager: true, import: "default" });
const overridesFiles = import.meta.glob("./references/*/music.overrides.js", { eager: true, import: "default" });

const fileOf = (name) => `./references/${AUDIO_REFERENCE}/${name}`;

export const reference = AUDIO_REFERENCE;

/** @type {import('./config.js').MusicConfig} */
export const generated = generatedFiles[fileOf("music.generated.js")];

/** @type {import('./config.js').MusicOverrides} */
export const overrides = overridesFiles[fileOf("music.overrides.js")] ?? {};

if (!generated) {
  const available = Object.keys(generatedFiles).map((path) => path.split("/")[2]).join(", ");
  throw new Error(`[audio] unknown reference "${AUDIO_REFERENCE}" (available: ${available}). Run \`npm run audio:generate\`.`);
}
