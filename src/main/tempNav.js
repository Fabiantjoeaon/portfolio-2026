const PROJECT_PATH_RE = /^\/project\/([\w-]+)\/?$/;
const ABOUT_PATH_RE = /^\/about\/?$/;

function isPinnedPage(pathname = window.location.pathname) {
  return PROJECT_PATH_RE.test(pathname) || ABOUT_PATH_RE.test(pathname);
}

/**
 * Temporary home / about / project navigation until real UI lands.
 */
export function initTempNav(api, dispatcher) {
  const btn = document.createElement("button");
  btn.type = "button";
  Object.assign(btn.style, {
    position: "fixed",
    top: "16px",
    left: "16px",
    zIndex: "10000",
    padding: "10px 14px",
    font: "14px system-ui, sans-serif",
    color: "#fff",
    background: "rgba(0, 0, 0, 0.45)",
    border: "1px solid rgba(255, 255, 255, 0.25)",
    borderRadius: "6px",
    cursor: "pointer",
    pointerEvents: "auto",
  });
  document.body.appendChild(btn);

  const goHome = () => {
    api.trigger({ name: "closeProject" }, {});
    api.trigger({ name: "closeAbout" }, {});
    if (window.location.pathname !== "/") {
      window.history.pushState({}, "", "/");
    }
    sync();
  };

  const sync = () => {
    if (isPinnedPage()) {
      btn.textContent = "Back";
      btn.onclick = goHome;
    } else {
      btn.textContent = "About";
      btn.onclick = () => api.trigger({ name: "openAbout" }, {});
    }
  };

  window.addEventListener("popstate", sync);
  dispatcher.on("projectOpened", sync);
  dispatcher.on("aboutOpened", sync);
  sync();
}
