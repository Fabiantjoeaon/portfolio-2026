import CONTENT, { mediaKey } from "../content/projects/index.js";
import MEDIA from "./projectMedia.json" with { type: "json" };

/** Touch devices load the `.mobile` rendition written next to each file. */
export const mobilePath = (path) => path.replace(/(\.\w+)$/, ".mobile$1");

/** The HEVC copy `npm run media:projects` writes next to each video. */
export const hevcPath = (path) => path.replace(/\.mp4$/, ".hevc.mp4");

/** The rendition of a manifest media entry for this device: `{ src, poster, width, height }`. */
export function mediaSrc(media, touch) {
  if (!touch) return media;
  return {
    ...media,
    src: mobilePath(media.src),
    poster: media.poster && mobilePath(media.poster),
    width: media.mobile.width,
    height: media.mobile.height,
  };
}

/**
 * Canonical project list, shared between the worker (grid tiles, project
 * scene) and the main thread (routing). Content lives in src/content/projects;
 * optimized media comes from projectMedia.json.
 */
export const PROJECTS = CONTENT.map(({ media: config, ...project }) => {
  const { thumb = null, details = [], media = [] } = MEDIA[project.slug] ?? {};
  const visible = media.filter(entry => !entry.omit);
  if (!visible.length) console.warn(`No media for ${project.slug}; run npm run media:projects`);
  const cut = visible.findIndex(entry => entry.slide === false);
  const alt = new Map(Object.entries(config.alt ?? {}).map(([file, text]) => [mediaKey(file), text]));
  let films = 0;
  let images = 0;
  return {
    ...project,
    video: thumb,
    details,
    slideCount: cut === -1 ? visible.length : cut,
    media: visible.map((entry) => {
      const fallback = entry.type === "video"
        ? `${project.name} — film ${++films}`
        : `${project.name} — still ${++images}`;
      return { ...entry, alt: alt.get(mediaKey(entry.file)) ?? fallback };
    }),
  };
});

export function findProject(slug) {
  return PROJECTS.find((project) => project.slug === slug) ?? null;
}
