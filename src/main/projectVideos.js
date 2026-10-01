import * as Comlink from "comlink";
import { PROJECTS, mobilePath } from "@/shared/projects";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";
import { getFlag } from "@/offscreen/lib/query";

/**
 * Main-thread project video player.
 *
 * HTML video can't play inside the OffscreenCanvas worker, so the worker asks
 * for videos via the `projectVideoRequest` event ({ channel, url, sync }) and
 * this module plays them here and streams decoded frames back through the
 * `projectVideoFrame` event, tagged with their channel: GPU-backed VideoFrames
 * where WebCodecs exists, resized ImageBitmaps otherwise. In non-offscreen
 * mode (?debug) the same code runs against the shared dispatcher directly.
 *
 * Channels play independently: `screen` is the home hover and the active
 * gallery slide, `detail0`/`detail1` the detail items lower on a project
 * page. The worker already picks the touch rendition for gallery videos;
 * thumbnails are buffered here, so they resolve it themselves. `sync` starts
 * the new video at the outgoing one's time (thumbnail → its full film).
 */
export function initProjectVideos(api, dispatcher) {
  const touch = getFlag("touchExperience");
  const thumbs = PROJECTS.filter((project) => project.video)
    .map((project) => resolvePublicPath(touch ? mobilePath(project.video) : project.video));
  const persistent = new Set(thumbs);
  const videos = new Map();
  const channels = new Map();

  const getVideo = (url) => {
    let video = videos.get(url);
    if (!video) {
      video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.src = url;
      videos.set(url, video);
    }
    return video;
  };

  const inUse = (url) => [...channels.values()].some((channel) => channel.url === url);

  const release = (url) => {
    if (!url || inUse(url)) return;
    const video = videos.get(url);
    if (!video) return;
    video.pause();
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
    if (id !== channel.requestId || url === channel.url) return;

    const previous = channel.url;
    const time = sync && previous ? videos.get(previous)?.currentTime ?? 0 : 0;
    channel.url = url ?? null;
    channel.loopId++;
    release(previous);
    if (!channel.url) return;

    const video = getVideo(channel.url);
    const shared = [...channels.values()].some((other) => other !== channel && other.url === channel.url);
    if (!shared) video.currentTime = time;
    const playing = video.play();
    if (playing?.catch) playing.catch(() => {});
    startStreaming(video, channel.url, channel);
  });

  // Invoke play synchronously from the entry gesture so every thumbnail may
  // play later, including under iOS Low Power Mode.
  return () => {
    for (const url of thumbs) {
      getVideo(url).play()?.then(() => { if (!inUse(url)) videos.get(url).pause(); }).catch(() => {});
    }
  };
}
