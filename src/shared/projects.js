/**
 * Canonical project list, shared between the worker (grid tiles, project
 * scene) and the main thread (routing). `pos` is the normalized grid
 * position of the project's active tile.
 */
export const PROJECTS = [
  {
    slug: "wsj-iconic-mints",
    pos: [0.15, 0.55],
    name: "WSJ Iconic Mints",
    video: "assets/video/iconic_mints.mp4",
  },
  {
    slug: "lowlyland",
    pos: [0.55, 0.15],
    name: "Lowlyland",
    video: "assets/video/lowlyland.mp4",
  },
  {
    slug: "the-monolith-project",
    pos: [0.1, 0.85],
    name: "The Monolith Project",
    video: "assets/video/monolith.mp4",
  },
  {
    slug: "spotify-made-to-be-found",
    pos: [0.88, 0.6],
    name: "Spotify Made To Be Found",
    video: "assets/video/made_to_be_found.mp4",
  },
  {
    slug: "spotify-album-ranker",
    pos: [0.68, 0.4],
    name: "Spotify Album Ranker",
    video: "assets/video/spotify_top_5.mp4",
  },
];

export function findProject(slug) {
  return PROJECTS.find((project) => project.slug === slug) ?? null;
}
