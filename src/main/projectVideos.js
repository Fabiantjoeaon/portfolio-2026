import * as Comlink from "comlink";
import { PROJECTS } from "@/shared/projects";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";

/**
 * Main-thread project video player.
 *
 * HTML video can't play inside the OffscreenCanvas worker, so the worker asks
 * for a video via the `projectVideoRequest` event (url or null) and this
 * module plays it here and streams decoded frames back as transferred
 * ImageBitmaps through the `projectVideoFrame` event. In non-offscreen mode
 * (?debug) the same code runs against the shared dispatcher directly.
 */
export function initProjectVideos(api, dispatcher) {
  const videos = new Map();
  let activeUrl = null;
  let requestId = 0;
  let loopId = 0;

  const getVideo = (url) => {
    let video = videos.get(url);
    if (!video) {
      video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      videos.set(url, video);
    }
    return video;
  };

  // Buffer the small, fixed project collection while scene preparation runs.
  // Only the active video plays/streams; preloading adds no per-frame work.
  for (const project of PROJECTS) {
    if (project.video) getVideo(resolvePublicPath(project.video)).load();
  }

  const startStreaming = (video, url) => {
    const id = ++loopId;
    const useRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;

    const schedule = () => {
      if (useRVFC) video.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };

    const step = async () => {
      if (id !== loopId || activeUrl !== url) return;

      if (video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const bitmap = await createImageBitmap(video);
          if (id !== loopId || activeUrl !== url) {
            bitmap.close();
            return;
          }
          await api.trigger(
            { name: "projectVideoFrame" },
            Comlink.transfer(
              {
                bitmap,
                width: bitmap.width,
                height: bitmap.height,
                url,
              },
              [bitmap],
            ),
          );
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

  // Invoke play synchronously from the entry gesture, including buffered reels.
  return () => {
    for (const [url, video] of videos) {
      video.play()?.then(() => { if (url !== activeUrl) video.pause(); }).catch(() => {});
    }
  };
}
