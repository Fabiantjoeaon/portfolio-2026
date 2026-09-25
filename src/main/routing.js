import AboutPage from "@/main/pages/AboutPage";
import ProjectPage from '@/main/pages/ProjectPage';
import { findProject } from '@/shared/projects';

const PROJECT_PATH_RE = /^\/project\/([\w-]+)\/?$/;
const ABOUT_PATH_RE = /^\/about\/?$/;

function routeFromPath(pathname) {
  const slug = PROJECT_PATH_RE.exec(pathname)?.[1];
  if (slug) return { kind: "project", slug };
  return { kind: ABOUT_PATH_RE.test(pathname) ? "about" : "home" };
}

export function initRouting(api, dispatcher) {
  let page = null;
  let revision = 0;
  let pendingPath = null;
  let sceneReady = false;
  let scenePath = null;
  let aboutReturnPath = '/';
  window.history.scrollRestoration = "manual";

  const sync = () => {
    const about = ABOUT_PATH_RE.test(window.location.pathname);
    const project = findProject(PROJECT_PATH_RE.exec(window.location.pathname)?.[1]);
    document.title = about ? "About — Fabian Tjoe-A-On" : project ? `${project.name} — Fabian Tjoe-A-On` : "Fabian Tjoe-A-On — Creative developer";
    dispatcher.trigger({ name: "routeChanged" });
    if (about && sceneReady && scenePath === "/about" && !page) page = new AboutPage(api);
    if (project && sceneReady && scenePath === window.location.pathname && !page) page = new ProjectPage(api, project, dispatcher, navigate);
  };

  const navigate = async (pathname, { history = true } = {}) => {
    const next = routeFromPath(pathname);
    pathname = next.kind === "about" ? "/about" : next.kind === "project" ? `/project/${next.slug}` : "/";
    if (pathname === scenePath && page && !page.leaving) return;
    if (next.kind === 'about' && !ABOUT_PATH_RE.test(window.location.pathname))
      aboutReturnPath = PROJECT_PATH_RE.test(window.location.pathname) ? window.location.pathname : '/';
    document.documentElement.dataset.aboutReturnPath = aboutReturnPath;
    const currentRevision = ++revision;
    pendingPath = pathname;
    if (history && window.location.pathname !== pathname) window.history.pushState({}, "", pathname);
    dispatcher.trigger({ name: "routeChanged" });
    scenePath = null;
    // GPU and DOM exits overlap; opened events may arrive before DOM cleanup.
    api.trigger({ name: "navigatePage", fireAtStart: true }, {
      ...next, immediate: matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
    if (page) {
      const previous = page;
      await previous.out();
      if (currentRevision !== revision) return;
      previous.destroy();
      page = null;
    }
    if (currentRevision !== revision) return;
    sync();
  };

  const opened = (pathname) => {
    // Ignore a scene that finishes opening after a newer navigation request.
    if (pendingPath && pendingPath !== pathname) return;
    scenePath = pathname;
    pendingPath = null;
    if (window.location.pathname !== pathname) window.history.pushState({}, "", pathname);
    sync();
  };
  dispatcher.on("projectOpened", async (data) => {
    const slug = data ? await data.slug : null;
    if (slug) opened(`/project/${slug}`);
  });
  dispatcher.on("aboutOpened", () => opened("/about"));
  dispatcher.on("pageClosed", () => {
    if (pendingPath === "/") pendingPath = null;
  });
  dispatcher.on("compileEnd", () => { sceneReady = true; sync(); });
  window.addEventListener("popstate", () => navigate(window.location.pathname, { history: false }));
  navigate(window.location.pathname, { history: false });
  return navigate;
}
