import * as Comlink from "comlink";
import { PROJECTS } from "@/shared/projects";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";
import { getFlag } from "@/offscreen/lib/query";

/**
 * Main-thread project video player.
 *
 * HTML video can't play inside the OffscreenCanvas worker, so the worker asks
 * for a video via the `projectVideoRequest` event (url or null) and this
 * module plays it here and streams decoded frames back through the
 * `projectVideoFrame` event: GPU-backed VideoFrames where WebCodecs exists,
 * resized ImageBitmaps otherwise. In non-offscreen mode (?debug) the same
 * code runs against the shared dispatcher directly.
 *
 * Reels come from scripts/optimize-videos.mjs: touch devices get the
 * `.mobile.mp4` rendition, so frames need no resizing before upload.
 */
export function initProjectVideos(api, dispatcher) {
  const touch = getFlag("touchExperience");
  const urls = PROJECTS.filter((project) => project.video).map((project) => resolvePublicPath(project.video));
  const videos = new Map();
  let activeUrl = null;
  let requestId = 0;
  let loopId = 0;

  const getVideo = (url) => {
    let video = videos.get(url);
    if (!video) {
      video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.src = touch ? url.replace(/\.mp4$/, ".mobile.mp4") : url;
      videos.set(url, video);
    }
    return video;
  };

  // Buffer reels one at a time once the scenes are loaded, so they never
  // compete with scene assets for bandwidth. Requested reels jump the queue.
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
    for (const url of urls) await buffered(getVideo(url));
  };
  dispatcher.on("compileEnd", warm);

  const minFrameInterval = 1000 / (touch ? 30 : 60) - 2;
  const maxBitmapSize = touch ? 960 : 1920;
  const bitmapOptions = { resizeQuality: touch ? "low" : "medium" };
  let supportsFrames = typeof VideoFrame !== "undefined";

  const captureFrame = async (video, url) => {
    if (supportsFrames) {
      let frame;
      try {
        frame = new VideoFrame(video);
        await api.trigger(
          { name: "projectVideoFrame" },
          Comlink.transfer({ frame, width: frame.displayWidth, height: frame.displayHeight, url }, [frame]),
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
    if (activeUrl !== url) {
      bitmap.close();
      return;
    }
    await api.trigger(
      { name: "projectVideoFrame" },
      Comlink.transfer({ bitmap, width: bitmap.width, height: bitmap.height, url }, [bitmap]),
    );
  };

  const startStreaming = (video, url) => {
    const id = ++loopId;
    const useRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    let lastFrame = -Infinity;

    const schedule = () => {
      if (useRVFC) video.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };

    const step = async (now) => {
      if (id !== loopId || activeUrl !== url) return;

      if (now - lastFrame < minFrameInterval) {
        schedule();
        return;
      }

      if (video.readyState >= 2 && video.videoWidth > 0) {
        lastFrame = now;
        try {
          await captureFrame(video, url);
        } catch (_) {
          // Frame grab can fail transiently (e.g. seek); just try again
        }
      }

      if (id !== loopId || activeUrl !== url) return;
      schedule();
    };

    schedule();
  };

  dispatcher.on("projectVideoRequest", async (data) => {
    const id = ++requestId;
    const url = data ? await data.url : null;
    if (id !== requestId) return;

    if (url === activeUrl) return;

    if (activeUrl) {
      videos.get(activeUrl)?.pause();
    }

    activeUrl = url ?? null;
    loopId++;

    if (!activeUrl) return;

    const video = getVideo(activeUrl);
    video.currentTime = 0;
    const playing = video.play();
    if (playing?.catch) playing.catch(() => {});
    startStreaming(video, activeUrl);
  });

  // Invoke play synchronously from the entry gesture so every reel may play
  // later, including under iOS Low Power Mode.
  return () => {
    for (const url of urls) {
      getVideo(url).play()?.then(() => { if (url !== activeUrl) videos.get(url).pause(); }).catch(() => {});
    }
  };
}
