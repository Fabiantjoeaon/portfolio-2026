export default {
  slug: "wsj-iconic-mints",
  name: "WSJ Iconic Mints",
  pos: [0.15, 0.55],
  client: "The Wall Street Journal",
  agency: "Active Theory",
  year: "2022",
  url: "https://iconicmints.wsjbarrons.com/",
  description:
    "Built in collaboration with Dow Jones for the Wall Street Journal's Future of Everything Festival 2022, Iconic Mints is a desktop, mobile, and webVR experience that reimagines the traditional art gallery concept.",
  role: "Creative development",
  approach:
    "Visitors explore a set of interactive 3D environments together, with realtime multiplayer and live audio. I prototyped several of these environments and built the WebGL-based UI inside each one, along with the audio and narration system that runs across the whole experience. All environment content is driven from Sanity, so it stays editable instead of hardcoded.",
  awards: [
    { name: "Awwwards", body: "Site Of The Day", aside: "August 21, 2022" },
    { name: "CSSDA", body: "Site of the Day", aside: "June 21, 2022" },
    { name: "FWA", body: "FWA of the Day", aside: "June 2, 2022" },
  ],
  sky: {
    deepColor: "#303030",
    cloudShadowColor: "#000000",
    cloudLightColor: "#424242",
    coreGlowColor: "#000000",
    coreGlowColorScrolled: "#000000",
  },
  media: {
    order: ["thumb.mp4", "1.png", "2.png", "3.png", "4.png", "5.png", "6.png"],
    thumbnail: { file: "thumb.mp4", start: 0 },
    details: ["detail_1.png", "detail_2.png"],
    exclude: ["Iconic Mints.mp4"],
    alt: {},
  },
};
