import { resolvePublicPath } from "@/offscreen/utils/publicPath";
import { glyphGlowPath } from "@/shared/bakedTextures";
import { ENABLE_BAKED_TEXTURES } from "@/shared/flags";

// KTX2 maps stay GPU-compressed (UASTC; ETC1S for roughness), unflipped like
// the worker's bitmap path. Re-encode from the .jpg sources with toktx.
const RESOURCES = [
  {
    name: "transitionPattern",
    url: resolvePublicPath("assets/textures/transition/transition-pattern.png"),
    fileSize: 104342,
  },
  {
    name: "waterNormals",
    url: resolvePublicPath("assets/textures/waternormals.ktx2"),
    fileSize: 549597,
  },
  {
    name: "iceColor",
    url: resolvePublicPath("assets/textures/ice/ice_color.ktx2"),
    fileSize: 1023579,
  },
  {
    name: "iceRoughness",
    url: resolvePublicPath("assets/textures/ice/ice_roughness.ktx2"),
    fileSize: 197804,
  },
  {
    name: "iceDisplacement",
    url: resolvePublicPath("assets/textures/ice/ice_displacement.ktx2"),
    fileSize: 914435,
  },
  {
    name: "iceNormal",
    url: resolvePublicPath("assets/textures/ice/ice_normal.ktx2"),
    fileSize: 736756,
  },
  {
    name: "iceBottom",
    url: resolvePublicPath("assets/textures/ice/ice_bottom.ktx2"),
    fileSize: 869859,
  },
  ...(ENABLE_BAKED_TEXTURES ? [{
    name: "glyphGlowAll",
    url: resolvePublicPath(glyphGlowPath("all")),
    fileSize: 182361,
  }] : []),
];

export { RESOURCES };
