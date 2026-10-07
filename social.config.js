// Social media assets, rendered by `npm run media:social` into output.dir.
// Clips: 'name' plays the whole clip, ['name', from, to] a range in seconds,
// { src, from, to, transition, zoom, focus } gives full control. Quick cuts:
//   clips: [['meadow_1', 0.1, 0.3], ['meadow_1', 0.4, 0.5]]
// Names resolve against sources (clips prefer videos, images prefer screenshots);
// '*' expands to every file in the folder.

const SCREENSHOTS = "*";

export default {
  sources: { videos: "media/videos", images: "media/screenshots" },

  output: {
    dir: "media/social",
    width: 1080,
    height: 1080,
    fps: 30,
    video: {
      crf: 18,
      preset: "slow",
      maxrate: 12000,
      sharpen: 0.3,
      grain: 1.5,
      cover: 3,
    },
    image: { format: "jpg", quality: 100, sharpen: 0.1 },
  },

  // `type`: 'glow' or 'grid'. `ink` colors the grid and the grid transition.
  // glow: the site's noise-glow screen shader (site uses intensity 0.22, speed 0.155),
  //   blurred by `blur` px; `time` picks the pattern, `speed` drifts it in videos
  //   (0 holds it still), painted at `resolution` × size and `fps`.
  // grid: the loader's grid. `scale` renders it as if at that devicePixelRatio, `cell`
  //   overrides the cell size (CSS px), `fill` is the share of settled cells.
  //   `animate: true` or { flicker, ripple, intro } brings it alive in videos.
  background: {
    type: "glow",
    ink: "#dcedef",
    vignette: 0.75,
    glow: {
      intensity: 0.08,
      speed: 0.155,
      time: 30,
      blur: 24,
      tint: [0.7, 0.7, 1.05],
      resolution: 0.25,
      fps: 10,
    },
    grid: {
      color: "#000000",
      scale: 2,
      cell: null,
      fill: 1,
      dither: true,
      seed: 7,
      animate: false,
    },
  },

  // Any of these can be overridden per asset, per slot or (zoom, focus) per clip.
  // `radius` rounds the media's corners (px, 0 for square).
  frame: {
    padding: 48,
    gap: 32,
    fit: "contain",
    zoom: 1,
    focus: [0.5, 0.5],
    radius: 12,
  },

  // `type`: 'glitch', 'grid' (the loader's tile reveal), 'cut', or any ffmpeg xfade
  // name such as fade, dissolve, pixelize, hblur, fadeblack, zoomin, smoothleft.
  // glitch: a smooth crossfade with a zoom push and a glitch peaking mid-way. Each
  //   transition takes the next of `styles` (slices, blocks, shift, tear) in a
  //   `seed`ed order. `split` is the color fringe (share of width), `zoom` the push,
  //   `softness` how much of the transition the crossfade spans, `hold` the frames
  //   each glitch pattern stays, `flash` a brief lift at the peak.
  transition: {
    type: "glitch",
    duration: 1,
    glitch: {
      // styles: ["slices", "blocks", "shift", "tear"],
      styles: ["blocks"],
      seed: 4,
      strength: 1,
      split: 0.006,
      zoom: 0.04,
      softness: 0.7,
      hold: 2,
      flash: 0.08,
    },
    grid: { cell: 92, jitter: 0.35, flash: 0.5 },
  },

  assets: {
    "reel-main": {
      template: "center",
      clips: ["flower_1", "main"],
    },
    "reel-project": {
      template: "stack",
      clips: ["project_1", "project_2"],
    },
    "reel-about": {
      template: "center",
      clips: ["about"],
    },
    // "reel-scenes": {
    //   template: "center",
    //   clips: ["meadow_1", "main"],

    // },

    "reel-wall": {
      template: "mosaic",
      videos: "*",
      angle: -14,
      duration: 10,
    },

    "still-center": {
      template: "center",
      each: SCREENSHOTS,
    },
    "project-header-duo": {
      template: "stack",
      images: ["project_header_1", "project_bottom_1"],
    },
    "meadow-duo": {
      template: "stack",
      images: ["meadow_1", "meadow_2"],
    },
    "ice-duo": {
      template: "stack",
      images: ["ice_1", "ice_2"],
    },

    "still-trio-project-bottom": {
      template: "stack",
      images: ["project_bottom_1", "project_bottom_2"],
    },
    "still-trio-scenes": {
      template: "trio",
      images: ["ice_1", "cube_1", "meadow_1"],
    },
    "still-trio-column": {
      template: "trio",
      layout: "column",
      images: ["project_header_1", "project_header_2", "project_header_3"],
    },
    "still-wall": {
      template: "mosaic",
      images: SCREENSHOTS,
      angle: -14,
    },
    "still-wall-cube": {
      template: "mosaic",
      images: ["cube_1", "cube_2", "cube_3", "cube_4", "cube_5"],
      angle: 14,
    },
    "still-wall-steep": {
      template: "mosaic",
      images: SCREENSHOTS,
      angle: -32,
      cardWidth: 0.3,
      gap: 20,
    },
    "still-cascade": {
      template: "cascade",
      images: ["about", "cube_2", "ice_2"],
    },
  },
};
