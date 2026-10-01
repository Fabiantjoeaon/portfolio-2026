import CONTENT from "../content/projects/index.js";
import MEDIA from "./projectMedia.json" with { type: "json" };

/** Touch devices load the `.mobile` rendition written next to each file. */
export const mobilePath = (path) => path.replace(/(\.\w+)$/, ".mobile$1");

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
  if (!media.length) console.warn(`No media for ${project.slug}; run npm run media:projects`);
  let films = 0;
  let images = 0;
  return {
    ...project,
    video: thumb,
    details,
    media: media.map((entry) => {
      const fallback = entry.type === "video"
        ? `${project.name} — film ${++films}`
        : `${project.name} — still ${++images}`;
      return { ...entry, alt: config.alt?.[entry.file] ?? fallback };
    }),
  };
});

export function findProject(slug) {
  return PROJECTS.find((project) => project.slug === slug) ?? null;
}
