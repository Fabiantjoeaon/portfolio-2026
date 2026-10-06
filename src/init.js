import createCanvasContext from "@/main/utils/createCanvasElement";
import { gsap } from "gsap";
import { MAX_FPS } from "@/shared/frameLimit";
import { initLoader } from "@/main/loader";
import { initProjectVideos } from "@/main/projectVideos";
import { initRouting } from "@/main/routing";
import { initNavigation } from "@/main/navigation";
import { initSceneSwitcher } from "@/main/sceneSwitcher";
import { initPageLoader } from "@/main/pageLoader";
import "@/main/fonts";
import "@/main/styles/site.css";
import { initDomEvents } from "@/main/utils/domEvents";
import dispatcher from "@/shared/dispatcher";
import * as Comlink from "comlink";
import { setupRecording } from "@/main/recording";
import { store } from "@/offscreen/store";
import { isIOS, isSafari, isMobileOrTablet } from "@/shared/devices";
import {
  applyTierParams,
  detectTier,
  renderSetting,
  setTier,
} from "@/shared/tiers";
import { clampDpr } from "@/shared/flags";
import { getFlag, setQueryString } from "@/offscreen/lib/query";
import { detectWebGPU } from "@/shared/webgpuSupport";
import { showNoWebGPU } from "@/main/noWebGPU";
import { currentWorkerShaderCaptureActivation } from "three-blocks/app";

// The worker's own frame rate can't tell a 30 Hz display from a GPU-bound
// frame, so adaptive resolution gets the refresh from the main thread. The
// fast quartile skips frames the loading main thread drops.
function measureDisplayRefresh(api) {
  const intervals = [];
  let last = 0;
  const step = (now) => {
    if (last) intervals.push(now - last);
    last = now;
    if (intervals.length < 60) {
      requestAnimationFrame(step);
      return;
    }
    intervals.sort((a, b) => a - b);
    api.trigger(
      { name: "displayRefresh", fireAtStart: true },
      { interval: intervals[intervals.length >> 2] },
    );
  };
  requestAnimationFrame(step);
}

async function init(options) {
  const { supported, reason, limits } = await detectWebGPU();
  if (!supported) {
    showNoWebGPU(reason);
    return null;
  }
  dispatcher.on("webgpuUnavailable", ({ reason }) => showNoWebGPU(reason));
  return start({ ...options, limits });
}

function start({
  limits,
  record = false,
  debug = false,
  offscreen = !debug && !record,
  skipLoader = getFlag("skipLoader"),
} = {}) {
  gsap.ticker.fps(MAX_FPS);
  dispatcher.trigger({ name: "loadProgress" }, { progress: 0 });

  // The shader capture driver's DOM only needs the canvas and the worker boot.
  const shaderCapture = currentWorkerShaderCaptureActivation();
  const entryLoader = shaderCapture
    ? null
    : initLoader(dispatcher, { skipLoader });

  const _isIOS = isIOS();
  const _isSafari = isSafari();

  let supportOffScreenWebGL =
    typeof HTMLCanvasElement !== "undefined" &&
    "transferControlToOffscreen" in HTMLCanvasElement.prototype;

  // If it's Safari, then check the version because Safari < 17 doesn't support OffscreenCanvas with a WebGL context.
  if (_isSafari || _isIOS) {
    const versionMatch = navigator.userAgent.match(/version\/(\d+)/i);
    const safariVersion = versionMatch ? parseInt(versionMatch[1]) : 0;
    supportOffScreenWebGL = safariVersion >= 17 && supportOffScreenWebGL;
  }

  if (!supportOffScreenWebGL) {
    offscreen = false;
  }

  const { context, canvas } = createCanvasContext("webgl2", {
    width: window.innerWidth,
    height: window.innerHeight,
    // Avoid creating a rendering context on the main thread when using OffscreenCanvas
    autoCreateContext: false, // Let WebGPURenderer handle context creation
  });
  canvas.style.cssText = "width: 100%; height: 100%;";
  document.body.appendChild(canvas);
  dispatcher.on("projectTileHover", ({ active }) => {
    canvas.style.cursor = active ? "pointer" : "";
  });
  for (const event of ["projectOpened", "aboutOpened", "pageClosed"]) {
    dispatcher.on(event, () => { canvas.style.cursor = ""; });
  }

  const initApp = async () => {
    const isWebGPU = true;

    const { tier, gpuScore } = await detectTier();
    setTier(tier);
    store.dpr = clampDpr(renderSetting("dpr"));
    const search = new URLSearchParams(window.location.search);
    search.set("tier", tier);
    if (gpuScore !== null) search.set("gpuScore", String(gpuScore));
    search.set("skipLoader", String(skipLoader));
    for (const [name, value] of Object.entries(limits)) search.set(name, String(value));
    search.set(
      "touchExperience",
      String(
        isMobileOrTablet() ||
          matchMedia("(hover: none) and (pointer: coarse)").matches,
      ),
    );
    setQueryString(`?${search}`);

    let api = dispatcher;
    let offscreenCanvas = canvas;
    let gui;

    if (offscreen && "transferControlToOffscreen" in canvas) {
      const worker = new Worker(
        new URL("./offscreen/offscreen.js", import.meta.url),
        {
          type: "module",
        },
      );

      self._workerOffscreen = worker;

      if (getFlag("fps")) {
        const { initFpsStats } = await import("@/main/fpsStats");
        initFpsStats(worker);
      }

      offscreenCanvas = canvas.transferControlToOffscreen();

      async function initWorker() {
        const workerApi = Comlink.wrap(worker);

        const ok = await workerApi.initOffscreen(
          Comlink.transfer(offscreenCanvas, [offscreenCanvas]),
          Boolean(isWebGPU),
          `?${search}`,
          shaderCapture,
        );
        if (!ok) return false;

        api = workerApi;

        workerApi.subscribeToAllEvents(
          Comlink.proxy(({ name, data }) => {
            dispatcher.trigger(
              {
                name: name,
                fireAtStart: true,
              },
              data,
            );
          }),
        );
        // Add other necessary events like touchstart, touchmove, touchend, etc.
        return true;
      }

      if (!(await initWorker())) {
        showNoWebGPU("runtime");
        return null;
      }
    } else {
      const initRendererAndSite = async () => {
        try {
          if (getFlag("fps")) {
            const { initFpsStats } = await import("@/main/fpsStats");
            initFpsStats();
          }

          const { params } = await import("./offscreen/params");
          applyTierParams(params);
          const { default: Renderer } = await import("./offscreen/renderer");
          const { default: Site } = await import("./offscreen/site");
          const gl = new Renderer({
            canvas,
            isWebGPU: Boolean(isWebGPU),
          });

          if (getFlag("debug")) {
            const { Inspector } =
              await import("three/addons/inspector/Inspector.js");
            gl.inspector = new Inspector();
            gl.inspector.domElement.setAttribute("data-lenis-prevent", "");
            gui = gl.inspector.createParameters("Build By Faab portfolio");
          }

          await gl.init();

          store.isWebGPU = Boolean(isWebGPU);
          store.gl = gl;

          const { installShaders } = await import("./offscreen/shaderCache");
          new Site({
            gl,
            shadersReady: installShaders(gl).catch((error) =>
              console.warn("[shaders] live fallback:", error),
            ),
          });
          return true;
        } catch (error) {
          console.error("Error initializing Renderer and Site:", error);
          return false;
        }
      };

      if (!(await initRendererAndSite())) {
        showNoWebGPU("runtime");
        return null;
      }
    }

    store.api = api;
    if (shaderCapture) {
      const { innerWidth: width, innerHeight: height } = window;
      const dpr = Math.min(store.dpr, window.devicePixelRatio);
      api.trigger(
        { name: "resize", fireAtStart: true },
        { width, height, dpr, ratio: width / height },
      );
      api.trigger({ name: "workerReady", fireAtStart: true }, {});
      return api;
    }
    initDomEvents(api, canvas);
    if (getFlag("hitches")) {
      let loaded = false;
      dispatcher.on("compileEnd", () => { loaded = true; });
      dispatcher.on("hitch", ({ gap, work }) => {
        if (loaded) console.warn(`[hitch] frame gap ${gap} ms, work ${work} ms`);
      });
    }
    measureDisplayRefresh(api);
    const unlockVideos = initProjectVideos(api, dispatcher);
    const navigate = initRouting(api, dispatcher);
    initNavigation(navigate, dispatcher);
    initSceneSwitcher(api, dispatcher);
    initPageLoader(dispatcher);

    // Console helpers: gotoScene("meadow" | 2), nextScene()
    window.gotoScene = (target) =>
      api.trigger({ name: "gotoScene" }, { target });
    window.nextScene = () => api.trigger({ name: "gotoScene" }, {});
    window.openProject = (slug) => navigate(`/project/${slug}`);
    window.closeProject = () => navigate("/");
    window.openAbout = () => navigate("/about");
    window.closeAbout = () => navigate("/");

    if (record && !offscreen) {
      await setupRecording({ context, api });
    } else if (record && offscreen) {
      console.warn(
        "Recording is not supported when running offscreen. Disable offscreen or implement worker-side recording.",
      );
    }

    if (debug && !offscreen && (gui || getFlag("debugAnimations"))) {
      api.trigger(
        { name: "initDebug", fireAtStart: true },
        {
          gui,
        },
      );
    }

    // Web Audio is main-thread only; worker scenes reach it via the dispatcher bridge.
    const { initAudio } = await import("@/audio/AudioEngine.js");
    window.audio = initAudio(dispatcher);
    dispatcher.trigger({ name: "audioReady", fireAtStart: true });
    await window.audio.prepare();
    api.trigger({ name: "workerReady", fireAtStart: true }, {});
    entryLoader.connect(api, unlockVideos);

    return api;
  };

  return initApp();
}

export { init };
