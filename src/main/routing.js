/**
 * Main-thread routing for /project/[slug] and /about.
 *
 * The worker owns the pinned-page state: opening a page triggers
 * `projectOpened` / `aboutOpened` (handled here with pushState), while
 * browser navigation (deep link, back/forward) is forwarded to the worker
 * as `openProject` / `openAbout` / `closeProject` / `closeAbout` events.
 */

const PROJECT_PATH_RE = /^\/project\/([\w-]+)\/?$/;
const ABOUT_PATH_RE = /^\/about\/?$/;

function routeFromPath(pathname) {
  const slug = PROJECT_PATH_RE.exec(pathname)?.[1];
  if (slug) return { name: "openProject", data: { slug } };
  if (ABOUT_PATH_RE.test(pathname)) return { name: "openAbout", data: {} };
  return null;
}

export function initRouting(api, dispatcher) {
  dispatcher.on("projectOpened", async (data) => {
    // Worker events arrive Comlink-proxied; property access is async
    const slug = data ? await data.slug : null;
    if (!slug) return;

    const target = `/project/${slug}`;
    if (window.location.pathname !== target) {
      window.history.pushState({ project: slug }, "", target);
    }
  });

  dispatcher.on("aboutOpened", () => {
    if (window.location.pathname !== "/about") {
      window.history.pushState({ about: true }, "", "/about");
    }
  });

  window.addEventListener("popstate", () => {
    const route = routeFromPath(window.location.pathname);
    if (route) {
      api.trigger({ name: route.name }, route.data);
    } else {
      // Each close handler checks whether its page is the pinned one
      api.trigger({ name: "closeProject" }, {});
      api.trigger({ name: "closeAbout" }, {});
    }
  });

  // Deep link: page loaded directly on /project/<slug> or /about
  const initialRoute = routeFromPath(window.location.pathname);
  if (initialRoute) {
    api.trigger(
      { name: initialRoute.name, fireAtStart: true },
      initialRoute.data,
    );
  }
}
