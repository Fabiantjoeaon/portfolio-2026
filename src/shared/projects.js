/**
 * Canonical project list, shared between the worker (grid tiles, project
 * scene) and the main thread (routing). `pos` is the normalized grid
 * position of the project's active tile.
 */
const projects = [
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

// Editorial placeholders for layout development; replace these with final credits.
const details = {
  'wsj-iconic-mints': ['The Wall Street Journal', '2024', 'iconic_mints', 'An invitation into a world of culture, collecting and digital objects. A visual journey built around discovery and playful interaction.'],
  'lowlyland': ['Lowlyland', '2024', 'monolith', 'A small world with a big sense of curiosity. An exploratory digital experience where character, landscape and movement tell the story.'],
  'savoir-faire': ['Louis Vuitton', '2023', 'savoir_faire', 'An exploration of craft and the details behind it. A digital experience that gives materials, gestures and stories space to unfold.'],
  'spotify-wrapped-2022': ['Spotify', '2022', 'made_to_be_found', 'A celebration of the music that makes a year. Bold typography and responsive motion turn listening habits into a personal visual story.'],
  'dior-winter-wonderland': ['Dior', '2023', 'savoir_faire', 'A seasonal world made for exploration. Atmospheric scenes and carefully timed interactions bring a sense of wonder to the screen.'],
  'google-demo-factory': ['Google', '2024', 'iconic_mints', 'An interactive playground for ideas. A collection of expressive digital moments that make new possibilities tangible.'],
  'astral-rift': ['Astral Rift', '2024', 'monolith', 'A journey through unfamiliar landscapes. Real-time imagery and fluid interaction invite visitors to discover what lies beyond the next scene.'],
  'marriott-passions': ['Marriott', '2023', 'savoir_faire', 'A digital invitation to follow your curiosity. People, places and personal stories come together in an experience designed for discovery.'],
  'royal-oak-50-years': ['Audemars Piguet', '2022', 'iconic_mints', 'A study in time, design and detail. An interactive editorial experience exploring the character of an enduring design.'],
  'the-monolith-project': ['The Monolith Project', '2024', 'monolith', 'An interactive journey through an imagined world. Follow a curious explorer across shifting landscapes, discovering quiet moments and unexpected details along the way.'],
  'spotify-made-to-be-found': ['Spotify', '2023', 'made_to_be_found', 'New sounds, new connections. An expressive digital experience about the ways music finds its audience.'],
  'spotify-album-ranker': ['Spotify', '2024', 'spotify_top_5', 'A playful way to put your favorites in order. A tactile, animated experience that turns a personal music collection into a story worth sharing.'],
};
const availableVideos = new Set(['monolith', 'iconic_mints', 'savoir_faire', 'made_to_be_found', 'spotify_top_5']);

export const PROJECTS = projects.map(project => {
  const [client, year, preview, description] = details[project.slug];
  const videoName = project.video.split('/').pop().replace('.mp4', '');
  const video = availableVideos.has(videoName) ? project.video : null;
  const images = [1, 2, 3].map(n => ({ type: 'image', src: `assets/projects/${preview}/${n}.webp`, alt: `${project.name} — visual study ${n}` }));
  return { ...project, video, client, year, agency: 'Independent studio', description,
    role: 'Creative development, interaction & real-time 3D',
    approach: 'An exploration of image, motion and interaction. The experience moves between expressive visual moments and a clear, considered interface, with attention to rhythm and detail across screens.',
    media: video ? [{ type: 'video', src: video, alt: `${project.name} — project film` }, ...images] : images,
    placeholder: true,
  };
});

export function findProject(slug) {
  return PROJECTS.find((project) => project.slug === slug) ?? null;
}
