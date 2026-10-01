// One file per project; this list sets the order (grid, "next project").
//   slug, name     route (/project/<slug>) and display name
//   pos            normalized position of the project's tile in the home grid
//   client, agency, year, description, role, approach   page copy
//   url            live project; the header's "Visit project" link only renders when set
//   awards         [{ name, body, aside, url? }]; the Awards section only renders when non-empty
//   media          originals live in originals/projects/<slug>; run `npm run media:projects` after
//                  adding or changing them. Every field below names originals by file name, as in
//                  that folder ("Kapture 2026-10-01 at 12.08.17.mp4"); case, punctuation and the
//                  extension don't matter. Desktop and mobile renditions are picked automatically.
//     order        gallery slides listed first, in this order; the rest follow, videos first
//     thumbnail    { file, start } for the 10s home loop; null picks the longest landscape video
//                  at 10%. Projects without any video show their first image on the home screen
//     details      up to two files shown as Detail 01 / 02 under the page; [] hides the section.
//                  Details that aren't in `order` are left out of the gallery
//     exclude      files to leave out (byte-identical duplicates are skipped automatically)
//     alt          { "file name": "alt text" }; defaults to "<name> — film/still n"
import wsjIconicMints from "./wsj-iconic-mints.js";
import lowlyland from "./lowlyland.js";
import savoirFaire from "./savoir-faire.js";
import spotifyWrapped2022 from "./spotify-wrapped-2022.js";
import diorGardenOfDreams from "./dior-garden-of-dreams.js";
import googleDemoFactory from "./google-demo-factory.js";
import astralRift from "./astral-rift.js";
import marriottPassions from "./marriott-passions.js";
import royalOak50Years from "./royal-oak-50-years.js";
import theMonolithProject from "./the-monolith-project.js";
import spotifyMadeToBeFound from "./spotify-made-to-be-found.js";
import spotifyAlbumRanker from "./spotify-album-ranker.js";

const MEDIA_EXTENSION = /\.(mp4|mov|m4v|webm|mkv|png|jpe?g|webp|tiff?)$/i;

/** Identity of a media file name: also its encoded output name. */
export const mediaKey = file => String(file).replace(MEDIA_EXTENSION, '')
  .normalize('NFKD').replace(/[^\x20-\x7e]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default [
  wsjIconicMints,
  lowlyland,
  savoirFaire,
  spotifyWrapped2022,
  diorGardenOfDreams,
  googleDemoFactory,
  astralRift,
  marriottPassions,
  royalOak50Years,
  theMonolithProject,
  spotifyMadeToBeFound,
  spotifyAlbumRanker,
];
