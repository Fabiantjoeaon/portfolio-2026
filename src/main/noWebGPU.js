import "./styles/noWebGPU.css";
import { PROJECTS } from "@/shared/projects";
import { routeMeta } from "@/shared/seo";

const MESSAGES = {
  forced: "WebGPU is disabled for this visit.",
  unsupported: "Your browser doesn't support WebGPU yet.",
  insecure: "WebGPU is only available over https.",
  "no-adapter": "WebGPU is available, but no compatible graphics adapter was found.",
  limits: "Your graphics hardware doesn't meet the requirements of this experience.",
  device: "WebGPU couldn't be started on this device.",
  runtime: "WebGPU stopped working while loading the experience.",
  lost: "The graphics device was lost and couldn't be recovered.",
};

let shown = false;

export function showNoWebGPU(reason = "unsupported") {
  if (shown) return;
  shown = true;

  self._workerOffscreen?.terminate();
  document.querySelectorAll("body > canvas, #loader-overlay").forEach((el) => el.remove());
  document.body.className = "is-no-webgpu";
  const app = document.querySelector("#app");
  if (app) {
    app.inert = false;
    app.replaceChildren();
  }

  const meta = routeMeta(location.pathname);
  const heading = meta.project?.name ?? (meta.path === "/about" ? "About" : "This portfolio is a real-time WebGPU experience.");
  const page = document.createElement("main");
  page.className = "no-webgpu";
  page.innerHTML = `
  <header class="no-webgpu-header">
    <a class="site-identity" href="/">Fabian Tjoe-A-On</a>
    <span class="site-role"><span data-mono>Creative developer</span></span>
  </header>
  <section class="no-webgpu-body">
    <p class="no-webgpu-label" data-mono>WebGPU required</p>
    <h1 class="no-webgpu-title">${heading}</h1>
    <p class="no-webgpu-message">${meta.description}</p>
    <p class="no-webgpu-message">${MESSAGES[reason] ?? MESSAGES.unsupported}
      Try a recent version of Chrome, Edge or Safari on a desktop, with hardware acceleration enabled.</p>
    <nav aria-label="Selected work">
      <ul class="no-webgpu-work">
        ${PROJECTS.map((project) => `<li><a href="/project/${project.slug}">${project.name}</a> <span data-mono>${project.client}, ${project.year}</span></li>`).join("")}
        <li><a href="/about">About</a></li>
      </ul>
    </nav>
  </section>
  <footer class="no-webgpu-footer">
    <a href="mailto:fabiantjoeaon@gmail.com" data-mono>fabiantjoeaon@gmail.com</a>
  </footer>`;
  document.body.appendChild(page);
}
