import { resolvePublicPath } from "@/offscreen/utils/publicPath";

const RESOURCES = [
  {
    name: "waterNormals",
    url: resolvePublicPath("assets/textures/waternormals.jpg"),
    fileSize: 102400, // approximately 100KB
  },
  {
    name: "iceColor",
    url: resolvePublicPath("assets/textures/ice/ice_color.jpg"),
    fileSize: 1081720,
  },
  {
    name: "iceRoughness",
    url: resolvePublicPath("assets/textures/ice/ice_roughness.jpg"),
    fileSize: 467557,
  },
  {
    name: "iceDisplacement",
    url: resolvePublicPath("assets/textures/ice/ice_displacement.jpg"),
    fileSize: 581195,
  },
  {
    name: "iceNormal",
    url: resolvePublicPath("assets/textures/ice/ice_normal.jpg"),
    fileSize: 1277023,
  },
  {
    name: "iceBottom",
    url: resolvePublicPath("assets/textures/ice/ice_bottom.jpg"),
    fileSize: 974261,
  },
  {
    name: "transitionSwirl",
    url: resolvePublicPath("assets/textures/transition/transition-swirl.png"),
    fileSize: 4415862,
  },
  {
    name: "transitionRadial",
    url: resolvePublicPath("assets/textures/transition/transition-radial.png"),
    fileSize: 4415862,
  },
];

export { RESOURCES };
