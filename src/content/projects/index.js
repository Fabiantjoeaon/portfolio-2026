// One file per project; this list sets the order (grid, "next project").
//   slug, name     route (/project/<slug>) and display name
//   pos            normalized position of the project's tile in the home grid
//   client, agency, year, description, role, approach   page copy
//   url            live project; the header's "Visit project" link only renders when set
//   awards         [{ name, body, aside, url? }]; the Awards section only renders when non-empty
//   media          raw files in assets-src/projects/<folder>; run `npm run media:projects` after changes
//     order        gallery order by file name; unlisted files follow (videos first, then images).
//                  The first slide is never blur-padded: the first unpadded file moves to the front
//     thumbnail    { file, start } for the 10s home loop; null picks the longest landscape video
//                  at 10%. Projects without any video show their first image on the home screen
//     details      two file names for the detail items lower on the page; [] picks automatically
//     exclude      file names to skip (byte-identical duplicates are skipped automatically)
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
