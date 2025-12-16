import { resolvePublicPath } from "@/offscreen/utils/publicPath";

const RESOURCES = [
  {
    name: "waterNormals",
    url: resolvePublicPath("assets/textures/waternormals.jpg"),
    fileSize: 102400, // approximately 100KB
  },
];

export { RESOURCES };
