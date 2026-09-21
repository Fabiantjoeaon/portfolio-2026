/**
 * Main-thread routing for /project/[slug].
 *
 * The worker owns the project state: clicking an active tile triggers
 * `projectOpened` (handled here with pushState), while browser navigation
 * (deep link, back/forward) is forwarded to the worker as `openProject` /
 * `closeProject` events.
 */

const PROJECT_PATH_RE = /^\/project\/([\w-]+)\/?$/;

function slugFromPath(pathname) {
  return PROJECT_PATH_RE.exec(pathname)?.[1] ?? null;
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

  window.addEventListener("popstate", () => {
    const slug = slugFromPath(window.location.pathname);
    if (slug) {
      api.trigger({ name: "openProject" }, { slug });
    } else {
      api.trigger({ name: "closeProject" }, {});
    }
  });

  // Deep link: page loaded directly on /project/<slug>
  const initialSlug = slugFromPath(window.location.pathname);
  if (initialSlug) {
    api.trigger(
      { name: "openProject", fireAtStart: true },
      { slug: initialSlug },
    );
  }
}
