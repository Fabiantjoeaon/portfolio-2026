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
    slug: "savoir-faire",
    pos: [0.4, 0.9],
    name: "Savoir Faire",
    video: "assets/video/savoir_faire.mp4",
  },
  {
    slug: "spotify-wrapped-2022",
    pos: [0.1, 0.2],
    name: "Spotify Wrapped 2022",
    video: "assets/video/spotify_wrapped_2022.mp4",
  },
  {
    slug: "dior-winter-wonderland",
    pos: [0.95, 0.05],
    name: "Dior Winter Wonderland",
    video: "assets/video/dior_winter_wonderland.mp4",
  },
  {
    slug: "google-demo-factory",
    pos: [0.4, 0.7],
    name: "Google Demo Factory",
    video: "assets/video/google_demo_factory.mp4",
  },
  {
    slug: "astral-rift",
    pos: [0.2, 0.7],
    name: "Astral Rift",
    video: "assets/video/astral_rift.mp4",
  },
  {
    slug: "marriott-passions",
    pos: [0.8, 0.8],
    name: "Marriott Passions",
    video: "assets/video/marriott_passions.mp4",
  },
  {
    slug: "royal-oak-50-years",
    pos: [0.95, 0.95],
    name: "AP: Royal Oak 50 Years",
    video: "assets/video/royal_oak_50_years.mp4",
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
