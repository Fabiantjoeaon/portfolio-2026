import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import "@/offscreen/lib/customEases";
import dispatcher from "@/shared/dispatcher";
import { getFlag } from "@/offscreen/lib/query";
import { PROJECTS } from "@/shared/projects";
import { touchCursorPoint } from "@/shared/touchLayout";
import { timings } from "@/shared/timings";
import { viewportHeight } from "@/main/utils/viewport";
import MonoShuffleAnimation from "@/main/utils/MonoShuffleAnimation";
import { formatMonoLabel } from "@/main/utils/monoLabels";
import { soundHint } from "@/main/sceneSwitcher";
import "./styles/touch.css";

gsap.registerPlugin(SplitText);

const FOLLOW_RATE = 16;

/** A reticle that eases to the finger, giving touch users a persistent hover. */
export function initTouchCursor(api, canvas) {
  if (!getFlag("touchExperience")) return null;
  document.body.classList.add("is-touch-experience");
  const cursor = document.createElement("button");
  cursor.className = "touch-cursor";
  cursor.type = "button";
  cursor.setAttribute("aria-label", "Drag to preview projects");
  cursor.innerHTML =
    '<span class="touch-cursor-shape"><i></i><i></i><i></i><i></i><b>+</b></span>';
  const hint = document.createElement("div");
  hint.className = "touch-instructions";
  hint.inert = true;
  hint.innerHTML =
    '<button type="button" class="touch-project-name" tabindex="-1"></button>';
  const labelWrap = document.createElement("div");
  labelWrap.className = "touch-cursor-label";
  labelWrap.innerHTML =
    '<span class="touch-instruction-label">[ DRAG TO EXPLORE ]</span>';
  document.body.append(cursor, labelWrap, hint);
  const label = new MonoShuffleAnimation(
    labelWrap.querySelector(".touch-instruction-label"),
  );
  let onWall = false,
    sceneName = "",
    sceneHint = "",
    labelText = "[ DRAG TO EXPLORE ]";
  const syncLabel = () => {
    const text = project
      ? "[ TAP + TO OPEN PROJECT ]"
      : onWall || !sceneHint
        ? "[ DRAG TO EXPLORE ]"
        : formatMonoLabel(sceneHint);
    if (text === labelText) return;
    labelText = text;
    label.to(text);
    measureLabel();
  };
  const nameRoot = hint.querySelector(".touch-project-name");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let nameLayer = null;
  // Every name gets its own masked layer so rapid hover changes can overlap:
  // the old one leaves upward while the new one rises in underneath.
  const hideName = (layer) => {
    const t = timings.touchLabel;
    gsap.to(layer.split.lines, {
      yPercent: -105,
      duration: reduced ? 0 : t.nameOut,
      ease: t.nameOutEase,
      overwrite: true,
      onComplete: () => {
        layer.split.revert();
        layer.element.remove();
        if (!project && !nameRoot.childElementCount)
          hint.classList.remove("has-project");
      },
    });
  };
  const showName = (text) => {
    if (nameLayer) hideName(nameLayer);
    nameLayer = null;
    if (!text) return;
    const t = timings.touchLabel;
    const element = document.createElement("span");
    element.className = "touch-project-name-layer";
    element.textContent = text;
    nameRoot.append(element);
    hint.classList.add("has-project");
    const split = SplitText.create(element, {
      type: "lines",
      mask: "lines",
      aria: "none",
    });
    nameLayer = { element, split };
    gsap.fromTo(
      split.lines,
      { yPercent: 105 },
      {
        yPercent: 0,
        duration: reduced ? 0 : t.nameIn,
        ease: t.nameInEase,
        stagger: 0.04,
      },
    );
  };
  let ready = false,
    active = false,
    project = null,
    drag = null,
    placed = false,
    frame = 0,
    last = 0;
  const origin = () =>
    touchCursorPoint(
      innerWidth,
      viewportHeight(),
      PROJECTS.map((project) => project.pos),
    );
  let { x, y } = origin(),
    tx = x,
    ty = y;
  let labelWidth = 0;
  const measureLabel = () => {
    labelWidth = labelWrap.offsetWidth;
  };
  const place = () => {
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const half = labelWidth * 0.5;
    const pad = 16;
    const cx = Math.min(innerWidth - pad - half, Math.max(pad + half, x));
    const below = y + 34;
    const flip = below > viewportHeight() - 28;
    labelWrap.style.transform = `translate3d(${cx}px, ${flip ? y - 16 : below}px, 0) translate(-50%, ${flip ? "-100%" : "0"})`;
  };
  const send = () => {
    api.trigger(
      { name: "pointermove", fireAtStart: true },
      {
        type: "pointermove",
        clientX: x,
        clientY: y,
        x,
        y,
        pointerType: "touch",
        isPrimary: true,
      },
    );
  };
  const follow = (now) => {
    frame = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
    last = now;
    const k = reduced ? 1 : 1 - Math.exp(-FOLLOW_RATE * dt);
    x += (tx - x) * k;
    y += (ty - y) * k;
    if (Math.abs(tx - x) < 0.1 && Math.abs(ty - y) < 0.1) {
      x = tx;
      y = ty;
    }
    place();
    send();
    if (x !== tx || y !== ty) frame = requestAnimationFrame(follow);
    else last = 0;
  };
  const moveTo = (nextX, nextY) => {
    tx = Math.min(innerWidth, Math.max(0, nextX));
    ty = Math.min(innerHeight, Math.max(0, nextY));
    if (!frame) frame = requestAnimationFrame(follow);
  };
  const sync = () => {
    const next =
      ready &&
      location.pathname === "/" &&
      !document.body.classList.contains("is-loading");
    if (active === next) return;
    active = next;
    drag = null;
    cursor.classList.remove("is-dragging");
    cursor.inert = !active;
    cursor.setAttribute("aria-hidden", String(!active));
    hint.setAttribute("aria-hidden", String(!active));
    labelWrap.setAttribute("aria-hidden", String(!active));
    hint.inert = !active;
    cursor.style.pointerEvents = active ? "auto" : "none";
    gsap.to([cursor, labelWrap, hint], {
      autoAlpha: active ? 1 : 0,
      duration: reduced ? 0 : active ? 0.7 : 0.35,
      overwrite: true,
    });
    gsap.to(cursor.firstElementChild, {
      scale: active ? 1 : 0.5,
      rotation: active ? 0 : -45,
      duration: reduced ? 0 : 0.7,
      ease: "power3.out",
      overwrite: true,
    });
    if (active) moveTo(tx, ty);
  };
  const open = () => {
    if (!active) return;
    if (project) window.openProject(project.slug);
    else
      api.trigger(
        { name: "click" },
        { clientX: x, clientY: y, pointerType: "touch" },
      );
  };
  // Anything but real controls counts as the stage, so a stale transparent
  // overlay can never swallow the home-page gestures.
  const isStage = (target) =>
    cursor.contains(target) ||
    target === canvas ||
    !target.closest?.(
      "a, button, input, select, textarea, [data-lenis-prevent]",
    );
  const down = (event) => {
    if (
      !active ||
      !event.isPrimary ||
      event.button !== 0 ||
      !isStage(event.target)
    )
      return;
    event.preventDefault();
    placed = true;
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cursor: cursor.contains(event.target),
    };
    cursor.classList.add("is-dragging");
    moveTo(event.clientX, event.clientY);
  };
  const move = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    moveTo(event.clientX, event.clientY);
  };
  const end = (event, cancelled = false) => {
    if (!drag || drag.id !== event.pointerId) return;
    const ended = drag;
    drag = null;
    cursor.classList.remove("is-dragging");
    const distance = Math.hypot(
      event.clientX - ended.startX,
      event.clientY - ended.startY,
    );
    if (!cancelled && ended.cursor && distance <= 6) open();
  };
  nameRoot.addEventListener("click", () => {
    if (active && project) window.openProject(project.slug);
  });
  window.addEventListener("pointerdown", down, { passive: false });
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", (event) => end(event));
  window.addEventListener("pointercancel", (event) => end(event, true));
  cursor.addEventListener("click", (event) => {
    if (event.detail === 0) open();
  });
  cursor.addEventListener("keydown", (event) => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction || !active) return;
    event.preventDefault();
    placed = true;
    moveTo(tx + direction[0] * 24, ty + direction[1] * 24);
  });
  dispatcher.on("touchControls", ({ enabled }) => {
    ready = enabled;
    sync();
  });
  dispatcher.on("touchWall", (data) => {
    onWall = data.onWall;
    syncLabel();
  });
  const applySceneHint = () => {
    sceneHint = soundHint(sceneName);
    syncLabel();
  };
  dispatcher.on("sceneTimeline", ({ index, names }) => {
    sceneName = names?.[index] ?? "";
    applySceneHint();
  });
  dispatcher.on("audioReady", () => {
    window.audio.addEventListener("statechange", applySceneHint);
    applySceneHint();
  });
  dispatcher.on("touchProject", (data) => {
    const previous = project;
    project = data.project;
    if (project?.slug === previous?.slug) return;
    showName(project?.name);
    syncLabel();
    cursor.classList.toggle("has-project", Boolean(project));
    nameRoot.tabIndex = project ? 0 : -1;
    if (project) nameRoot.setAttribute("aria-label", `Open ${project.name}`);
    else nameRoot.removeAttribute("aria-label");
    cursor.setAttribute(
      "aria-label",
      project
        ? `Open ${project.name}. Drag to explore.`
        : "Drag to preview projects",
    );
  });
  for (const event of ["routeChanged", "siteEntered", "pageClosed"])
    dispatcher.on(event, sync);
  window.addEventListener("resize", () => {
    if (!placed) ({ x: tx, y: ty } = origin());
    measureLabel();
    moveTo(tx, ty);
  });
  cursor.inert = true;
  measureLabel();
  place();
  if (getFlag("debugTouch")) {
    const panel = document.createElement("pre");
    panel.className = "touch-debug";
    document.body.append(panel);
    const describe = (element) =>
      element
        ? `${element.tagName.toLowerCase()}${element.className && typeof element.className === "string" ? `.${element.className.split(" ")[0]}` : ""}`
        : "-";
    let worker = {},
      lastDown = "-",
      downs = 0,
      moves = 0;
    const render = () => {
      const main = {
        path: location.pathname,
        ready,
        active,
        drag: Boolean(drag),
        project: project?.slug ?? null,
        cursor: `${Math.round(x)},${Math.round(y)}`,
        downs,
        moves,
        lastDown,
        body: document.body.className,
      };
      panel.textContent = Object.entries({ ...main, ...worker })
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
    };
    window.addEventListener(
      "pointerdown",
      (event) => {
        downs++;
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        lastDown = `${describe(event.target)} / top ${describe(hit)}`;
        render();
      },
      { capture: true },
    );
    window.addEventListener(
      "pointermove",
      () => {
        moves++;
      },
      { capture: true, passive: true },
    );
    dispatcher.on("touchDebug", (data) => {
      worker = data;
      render();
    });
  }
  return {
    get active() {
      return active;
    },
  };
}
