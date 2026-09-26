import createCanvasContext from "@/main/utils/createCanvasElement";
import { initLoader } from "@/main/loader";
import { initProjectVideos } from "@/main/projectVideos";
import { initRouting } from "@/main/routing";
import { initNavigation } from "@/main/navigation";
import "@/main/styles/site.css";
import { initDomEvents } from "@/main/utils/domEvents";
import dispatcher from "@/shared/dispatcher";
import * as Comlink from "comlink";
import { setupRecording } from "@/main/recording";
import { store } from "@/offscreen/store";
import { isIOS, isSafari } from "@/shared/devices";
import { applyTierParams, detectTier, renderSetting, setTier } from "@/shared/tiers";

function init({ record = false, debug = false, offscreen = !debug && !record } = {}) {
  dispatcher.trigger({ name: "loadProgress" }, { progress: 0 });

  initLoader(dispatcher);

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
  canvas.style = "width: 100%; height: 100%;";
  document.body.appendChild(canvas);

  const initApp = async () => {
    let isWebGPU = navigator.gpu !== undefined;

    const tier = await detectTier();
    setTier(tier);
    store.dpr = renderSetting("dpr");
    const search = new URLSearchParams(window.location.search);
    search.set("tier", tier);

    // if (isWebGPU) {
    //   isWebGPU = await navigator.gpu.requestAdapter(adapterOptions);
    // }
    // isWebGPU = false;

    let api = dispatcher;
    let offscreenCanvas = canvas;
    let gui;

    if (offscreen && "transferControlToOffscreen" in canvas) {
      const worker = new Worker(
        new URL("./offscreen/offscreen.js", import.meta.url),
        {
          type: "module",
        }
      );

      self._workerOffscreen = worker;

      offscreenCanvas = canvas.transferControlToOffscreen();

      async function initWorker() {
        const workerApi = Comlink.wrap(worker);

        await workerApi.initOffscreen(
          Comlink.transfer(offscreenCanvas, [offscreenCanvas]),
          Boolean(isWebGPU),
          `?${search}`
        );

        api = workerApi;

        workerApi.subscribeToAllEvents(
          Comlink.proxy(({ name, data }) => {
            dispatcher.trigger(
              {
                name: name,
                fireAtStart: true,
              },
              data
            );
          })
        );
        // Add other necessary events like touchstart, touchmove, touchend, etc.
      }

      await initWorker();
    } else {
      const initRendererAndSite = async () => {
        try {
          const { params } = await import("./offscreen/params");
          applyTierParams(params);
          const { default: Renderer } = await import("./offscreen/renderer");
          const { default: Site } = await import("./offscreen/site");
          const gl = new Renderer({
            canvas,
            isWebGPU: Boolean(isWebGPU),
          });

          if (debug) {
            const { Inspector } = await import("three/addons/inspector/Inspector.js");
            gl.inspector = new Inspector();
            gl.inspector.domElement.setAttribute("data-lenis-prevent", "");

            gui = gl?.inspector.createParameters("Build By Faab portfolio");
          }

          await gl.init();

          store.isWebGPU = Boolean(isWebGPU);
          store.gl = gl;

          new Site({
            gl,
          });
        } catch (error) {
          console.error("Error initializing Renderer and Site:", error);
        }
      };

      await initRendererAndSite();
    }

    store.api = api;
    initDomEvents(api, canvas);
    initProjectVideos(api, dispatcher);
    const navigate = initRouting(api, dispatcher);
    initNavigation(navigate, dispatcher);

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
        "Recording is not supported when running offscreen. Disable offscreen or implement worker-side recording."
      );
    }

    if (debug && !offscreen) {
      // Pass inspector's gui for main thread debug controls
      api.trigger(
        { name: "initDebug", fireAtStart: true },
        {
          gui,
        }
      );
    }

    api.trigger({ name: "workerReady", fireAtStart: true }, {});

    // Web Audio is main-thread only; worker scenes reach it via the dispatcher bridge.
    import("@/audio/AudioEngine.js").then(({ initAudio }) => {
      window.audio = initAudio(dispatcher);
    });

    return api;
  };

  return initApp();
}

export { init };
