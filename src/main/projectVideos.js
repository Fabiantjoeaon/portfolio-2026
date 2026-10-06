import * as Comlink from "comlink";
import { PROJECTS, hevcPath, mobilePath } from "@/shared/projects";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";
import { getFlag } from "@/offscreen/lib/query";

/**
 * Main-thread project video player.
 *
 * HTML video can't play inside the OffscreenCanvas worker, so the worker asks
 * for videos via the `projectVideoRequest` event ({ channel, url, sync, resume }) and
 * this module plays them here and streams decoded frames back through the
 * `projectVideoFrame` event, tagged with their channel: GPU-backed VideoFrames
 * where WebCodecs exists, resized ImageBitmaps otherwise. In non-offscreen
 * mode (?debug) the same code runs against the shared dispatcher directly.
 *
 * Channels play independently: `screen` is the home hover and the active
 * gallery slide, `detail0`/`detail1` the detail items lower on a project
 * page. The worker already picks the touch rendition for gallery videos;
 * thumbnails are buffered here, so they resolve it themselves. `sync` starts
 * the new video at the outgoing one's time (thumbnail → its full film);
 * `resume` continues a film from where this channel last left it.
 *
 * Videos are keyed by their H.264 URL; where HEVC decodes in hardware the
 * element loads the smaller HEVC copy instead, falling back if it fails.
 */
const HEVC_TYPE = 'video/mp4; codecs="hvc1.1.6.L123.B0"';
const sameFile = (url) => url;

export function initProjectVideos(api, dispatcher) {
  const touch = getFlag("touchExperience");
  let fileOf = sameFile;
  if (navigator.mediaCapabilities && document.createElement("video").canPlayType(HEVC_TYPE)) {
    navigator.mediaCapabilities.decodingInfo({
      type: "file",
      video: touch
        ? { contentType: HEVC_TYPE, width: 960, height: 554, bitrate: 1500000, framerate: 30 }
        : { contentType: HEVC_TYPE, width: 1920, height: 1108, bitrate: 4500000, framerate: 60 },
    }).then(({ supported, powerEfficient }) => {
      if (supported && powerEfficient) fileOf = hevcPath;
    }, () => {});
  }
  const thumbs = PROJECTS.filter((project) => project.video)
    .map((project) => resolvePublicPath(touch ? mobilePath(project.video) : project.video));
  const persistent = new Set(thumbs);
  const videos = new Map();
  const channels = new Map();
  // Played once inside the entry gesture. Later films reuse these elements:
  // a brand new element cannot start on iOS outside that gesture.
  const slots = [];
  // Where each film left off, so a slide still showing its last frame resumes from it.
  const resumeTimes = new Map();

  const urlOf = (video) => {
    for (const [url, candidate] of videos) if (candidate === video) return url;
    return null;
  };

  const createVideo = () => {
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.addEventListener("error", () => {
      const url = urlOf(video);
      if (!url || fileOf === sameFile) return;
      fileOf = sameFile;
      video.src = url;
      if (inUse(url)) video.play()?.catch(() => {});
    });
    video.addEventListener("pause", () => {
      if (video._hold || video._resuming) return;
      const url = urlOf(video);
      if (!url || !inUse(url)) return;
      video._resuming = true;
      const playing = video.play();
      const clear = () => { video._resuming = false; };
      if (playing?.then) playing.then(clear, clear);
      else clear();
    });
    return video;
  };

  const getVideo = (url, retarget = false) => {
    const existing = videos.get(url);
    if (existing) return existing;
    const video = (retarget && slots.find((candidate) => !inUse(urlOf(candidate)))) || createVideo();
    const previous = urlOf(video);
    if (previous) videos.delete(previous);
    video._hold = true;
    video.src = fileOf(url);
    video._hold = false;
    videos.set(url, video);
    return video;
  };

  const inUse = (url) => [...channels.values()].some((channel) => channel.url === url);

  const release = (url) => {
    if (!url || inUse(url)) return;
    const video = videos.get(url);
    if (!video) return;
    video._hold = true;
    video.pause();
    video._hold = false;
    if (persistent.has(url)) return;
    video.removeAttribute("src");
    video.load();
    videos.delete(url);
  };

  // Buffer thumbnails one at a time once the scenes are loaded, so they never
  // compete with scene assets for bandwidth. Requested videos jump the queue.
  const buffered = (video) => new Promise((resolve) => {
    if (video.readyState >= 3) return resolve();
    const done = () => {
      clearTimeout(timeout);
      video.removeEventListener("canplaythrough", done);
      video.removeEventListener("error", done);
      resolve();
    };
    const timeout = setTimeout(done, 10000);
    video.addEventListener("canplaythrough", done);
    video.addEventListener("error", done);
  });
  let warmed = false;
  const warm = async () => {
    if (warmed) return;
    warmed = true;
    for (const url of thumbs) await buffered(getVideo(url));
  };
  dispatcher.on("compileEnd", warm);
  // Buffer the film the page will switch to, without touching the one on screen.
  dispatcher.on("projectVideoPreload", async (data) => {
    const url = data ? await data.url : null;
    if (!url || videos.has(url)) return;
    await buffered(getVideo(url, true));
  });

  const minFrameInterval = 1000 / (touch ? 30 : 60) - 2;
  const maxBitmapSize = touch ? 960 : 1920;
  const bitmapOptions = { resizeQuality: touch ? "low" : "medium" };
  let supportsFrames = typeof VideoFrame !== "undefined";

  const captureFrame = async (video, url, channel) => {
    if (supportsFrames) {
      let frame;
      try {
        frame = new VideoFrame(video);
        await api.trigger(
          { name: "projectVideoFrame" },
          Comlink.transfer({ frame, width: frame.displayWidth, height: frame.displayHeight, url, channel: channel.name }, [frame]),
        );
        return;
      } catch (error) {
        frame?.close();
        // Transferable VideoFrames are missing in some WebCodecs builds.
        if (error?.name !== "DataCloneError") throw error;
        supportsFrames = false;
      }
    }
    const scale = Math.min(1, maxBitmapSize / Math.max(video.videoWidth, video.videoHeight));
    bitmapOptions.resizeWidth = Math.round(video.videoWidth * scale);
    bitmapOptions.resizeHeight = Math.round(video.videoHeight * scale);
    const bitmap = await createImageBitmap(video, bitmapOptions);
    if (channel.url !== url) {
      bitmap.close();
      return;
    }
    await api.trigger(
      { name: "projectVideoFrame" },
      Comlink.transfer({ bitmap, width: bitmap.width, height: bitmap.height, url, channel: channel.name }, [bitmap]),
    );
  };

  const startStreaming = (video, url, channel) => {
    const id = ++channel.loopId;
    const useRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    let lastFrame = -Infinity;
    const live = () => id === channel.loopId && channel.url === url;

    const schedule = () => {
      if (useRVFC) video.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };

    const step = async (now) => {
      if (!live()) return;

      if (now - lastFrame < minFrameInterval) {
        schedule();
        return;
      }

      if (video.readyState >= 2 && video.videoWidth > 0) {
        lastFrame = now;
        try {
          await captureFrame(video, url, channel);
        } catch (_) {
          // Frame grab can fail transiently (e.g. seek); just try again
        }
      }

      if (live()) schedule();
    };

    schedule();
  };

  dispatcher.on("projectVideoRequest", async (data) => {
    const name = (data && await data.channel) ?? "screen";
    let channel = channels.get(name);
    if (!channel) {
      channel = { name, url: null, requestId: 0, loopId: 0 };
      channels.set(name, channel);
    }
    const id = ++channel.requestId;
    const url = data ? await data.url : null;
    const sync = data ? await data.sync : false;
    const resume = data ? await data.resume : false;
    if (id !== channel.requestId || url === channel.url) return;

    const previous = channel.url;
    const previousTime = previous ? videos.get(previous)?.currentTime ?? 0 : 0;
    if (previous) resumeTimes.set(previous, previousTime);
    const time = sync ? previousTime : resume ? resumeTimes.get(url) ?? 0 : 0;
    channel.url = url ?? null;
    channel.held = false;
    channel.loopId++;
    release(previous);
    if (!channel.url) return;

    const video = getVideo(channel.url, true);
    const shared = [...channels.values()].some((other) => other !== channel && other.url === channel.url);
    if (!shared) video.currentTime = time;
    video._hold = false;
    const playing = video.play();
    if (playing?.catch) playing.catch(() => {});
    startStreaming(video, channel.url, channel);
  });

  // Paused while the tab is hidden or every channel showing it is out of view.
  const setPlayback = (url) => {
    const video = url && videos.get(url);
    if (!video) return;
    const wanted = !document.hidden && [...channels.values()].some((channel) => channel.url === url && !channel.held);
    video._hold = !wanted;
    if (wanted) video.play()?.catch(() => {});
    else video.pause();
  };
  document.addEventListener("visibilitychange", () => {
    for (const url of new Set([...channels.values()].map((channel) => channel.url))) setPlayback(url);
  });
  dispatcher.on("projectVideoHold", async (data) => {
    const channel = channels.get(await data.channel);
    if (!channel) return;
    channel.held = await data.held;
    setPlayback(channel.url);
  });

  // Invoke play synchronously from the entry gesture so every thumbnail may
  // play later, including under iOS Low Power Mode.
  return () => {
    const prime = (video, url) => {
      video._hold = false;
      video.play()?.then(() => {
        if (urlOf(video) !== url || !inUse(url)) { video._hold = true; video.pause(); }
      }).catch(() => {});
    };
    for (const url of thumbs) prime(getVideo(url), url);
    const seed = thumbs[0];
    for (let index = 0; index < 3; index++) {
      const video = createVideo();
      slots.push(video);
      if (!seed) continue;
      video.src = fileOf(seed);
      prime(video, seed);
    }
  };
}
